from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from datetime import datetime
from pathlib import Path
import shutil
from typing import Optional
from pydantic import BaseModel
from cryptography import x509
from cryptography.hazmat.backends import default_backend

from ..core.database import get_db
from ..models.user import User as UserModel
from .auth import get_current_user

router = APIRouter()


# API Key models
class APIKeyUpdate(BaseModel):
    api_key: str


class APIKeyStatus(BaseModel):
    configured: bool
    service: str
    last_updated: Optional[datetime] = None

# SSL certificate paths
SSL_DIR = Path(__file__).parent.parent.parent / "ssl"
CERT_FILE = SSL_DIR / "cert.pem"
KEY_FILE = SSL_DIR / "key.pem"
BACKUP_DIR = SSL_DIR / "backups"


def require_admin(current_user: UserModel = Depends(get_current_user)) -> UserModel:
    """Dependency to require admin user"""
    # First user (id=1) is always admin (owner), or user with is_admin=True
    if current_user.id != 1 and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access this resource"
        )
    return current_user


def validate_certificate(cert_content: bytes) -> dict:
    """Validate SSL certificate and extract information"""
    try:
        cert = x509.load_pem_x509_certificate(cert_content, default_backend())

        # Extract certificate information
        subject = cert.subject
        issuer = cert.issuer

        # Get common name
        cn_attrs = subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
        common_name = cn_attrs[0].value if cn_attrs else "Unknown"

        # Get organization
        org_attrs = subject.get_attributes_for_oid(x509.oid.NameOID.ORGANIZATION_NAME)
        organization = org_attrs[0].value if org_attrs else "Unknown"

        # Get issuer common name
        issuer_cn_attrs = issuer.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
        issuer_cn = issuer_cn_attrs[0].value if issuer_cn_attrs else "Unknown"

        return {
            "valid": True,
            "common_name": common_name,
            "organization": organization,
            "issuer": issuer_cn,
            "not_before": cert.not_valid_before_utc.isoformat(),
            "not_after": cert.not_valid_after_utc.isoformat(),
            "is_self_signed": subject == issuer,
            "serial_number": str(cert.serial_number)
        }
    except Exception as e:
        return {
            "valid": False,
            "error": str(e)
        }


def validate_private_key(key_content: bytes) -> bool:
    """Validate private key"""
    try:
        from cryptography.hazmat.primitives import serialization
        serialization.load_pem_private_key(key_content, password=None, backend=default_backend())
        return True
    except Exception:
        return False


@router.get("/ssl/info")
def get_ssl_info(current_user: UserModel = Depends(require_admin)):
    """Get current SSL certificate information"""
    if not CERT_FILE.exists():
        return {
            "installed": False,
            "message": "No SSL certificate installed"
        }

    try:
        with open(CERT_FILE, 'rb') as f:
            cert_content = f.read()

        cert_info = validate_certificate(cert_content)

        if not cert_info["valid"]:
            return {
                "installed": True,
                "valid": False,
                "error": cert_info.get("error", "Invalid certificate")
            }

        return {
            "installed": True,
            "valid": True,
            **cert_info
        }
    except Exception as e:
        return {
            "installed": True,
            "valid": False,
            "error": str(e)
        }


@router.post("/ssl/upload")
async def upload_ssl_certificate(
    certificate: UploadFile = File(..., description="SSL Certificate (PEM format)"),
    private_key: UploadFile = File(..., description="Private Key (PEM format)"),
    current_user: UserModel = Depends(require_admin)
):
    """Upload and install SSL certificate"""

    # Read uploaded files
    cert_content = await certificate.read()
    key_content = await private_key.read()

    # Validate certificate
    cert_info = validate_certificate(cert_content)
    if not cert_info["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid certificate: {cert_info.get('error', 'Unknown error')}"
        )

    # Validate private key
    if not validate_private_key(key_content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid private key"
        )

    try:
        # Create SSL directory if it doesn't exist
        SSL_DIR.mkdir(parents=True, exist_ok=True)
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        # Backup existing certificates if they exist
        if CERT_FILE.exists() and KEY_FILE.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            shutil.copy(CERT_FILE, BACKUP_DIR / f"cert_{timestamp}.pem")
            shutil.copy(KEY_FILE, BACKUP_DIR / f"key_{timestamp}.pem")

        # Write new certificate and key
        with open(CERT_FILE, 'wb') as f:
            f.write(cert_content)

        with open(KEY_FILE, 'wb') as f:
            f.write(key_content)

        # Set proper permissions
        CERT_FILE.chmod(0o644)
        KEY_FILE.chmod(0o600)

        return {
            "success": True,
            "message": "SSL certificate installed successfully",
            "certificate_info": cert_info,
            "restart_required": True
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to install certificate: {str(e)}"
        )


@router.post("/ssl/generate-self-signed")
def generate_self_signed_certificate(
    hostname: str,
    current_user: UserModel = Depends(require_admin)
):
    """Generate a self-signed SSL certificate"""
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    from datetime import datetime, timedelta

    try:
        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )

        # Create certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "State"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "City"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "WanderMage"),
            x509.NameAttribute(NameOID.COMMON_NAME, hostname),
        ])

        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.utcnow()
        ).not_valid_after(
            datetime.utcnow() + timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName(hostname),
                x509.DNSName(f"*.{hostname}"),
            ]),
            critical=False,
        ).sign(private_key, hashes.SHA256(), default_backend())

        # Create SSL directory if it doesn't exist
        SSL_DIR.mkdir(parents=True, exist_ok=True)
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        # Backup existing certificates if they exist
        if CERT_FILE.exists() and KEY_FILE.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            shutil.copy(CERT_FILE, BACKUP_DIR / f"cert_{timestamp}.pem")
            shutil.copy(KEY_FILE, BACKUP_DIR / f"key_{timestamp}.pem")

        # Write certificate
        with open(CERT_FILE, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        # Write private key
        with open(KEY_FILE, 'wb') as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))

        # Set proper permissions
        CERT_FILE.chmod(0o644)
        KEY_FILE.chmod(0o600)

        # Get certificate info
        with open(CERT_FILE, 'rb') as f:
            cert_info = validate_certificate(f.read())

        return {
            "success": True,
            "message": "Self-signed certificate generated successfully",
            "certificate_info": cert_info,
            "restart_required": True
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate certificate: {str(e)}"
        )


@router.delete("/ssl/certificate")
def delete_ssl_certificate(current_user: UserModel = Depends(require_admin)):
    """Delete current SSL certificate (backup will be kept)"""
    try:
        if CERT_FILE.exists() and KEY_FILE.exists():
            # Backup before deleting
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy(CERT_FILE, BACKUP_DIR / f"cert_{timestamp}_deleted.pem")
            shutil.copy(KEY_FILE, BACKUP_DIR / f"key_{timestamp}_deleted.pem")

            # Delete files
            CERT_FILE.unlink()
            KEY_FILE.unlink()

            return {
                "success": True,
                "message": "SSL certificate deleted (backup created)",
                "restart_required": True
            }
        else:
            return {
                "success": False,
                "message": "No SSL certificate found"
            }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete certificate: {str(e)}"
        )


# API Key Management Endpoints
# These endpoints manage external service API keys stored in user preferences

@router.get("/api-keys/{service}")
def get_api_key_status(
    service: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get API key status for a service (does not return the actual key)"""
    valid_services = ['eia', 'harvest-hosts', 'google-maps', 'openweather']

    if service not in valid_services:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown service: {service}. Valid services: {', '.join(valid_services)}"
        )

    # Get from user preferences
    prefs = current_user.preferences or {}
    api_keys = prefs.get('api_keys', {})
    key_info = api_keys.get(service, {})

    return {
        "service": service,
        "configured": bool(key_info.get('key')),
        "last_updated": key_info.get('updated_at'),
        "masked_key": f"***{key_info.get('key', '')[-4:]}" if key_info.get('key') else None
    }


@router.put("/api-keys/{service}")
def update_api_key(
    service: str,
    key_data: APIKeyUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Update API key for a service"""
    valid_services = ['eia', 'harvest-hosts', 'google-maps', 'openweather']

    if service not in valid_services:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown service: {service}. Valid services: {', '.join(valid_services)}"
        )

    # Update user preferences
    prefs = current_user.preferences or {}
    if 'api_keys' not in prefs:
        prefs['api_keys'] = {}

    prefs['api_keys'][service] = {
        'key': key_data.api_key,
        'updated_at': datetime.utcnow().isoformat()
    }

    current_user.preferences = prefs
    db.commit()

    return {
        "service": service,
        "message": "API key updated successfully",
        "configured": True
    }


@router.delete("/api-keys/{service}")
def delete_api_key(
    service: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Delete API key for a service"""
    valid_services = ['eia', 'harvest-hosts', 'google-maps', 'openweather']

    if service not in valid_services:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown service: {service}. Valid services: {', '.join(valid_services)}"
        )

    # Update user preferences
    prefs = current_user.preferences or {}
    api_keys = prefs.get('api_keys', {})

    if service in api_keys:
        del api_keys[service]
        prefs['api_keys'] = api_keys
        current_user.preferences = prefs
        db.commit()

    return {
        "service": service,
        "message": "API key deleted successfully",
        "configured": False
    }


@router.get("/api-keys")
def get_all_api_key_statuses(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get status of all API keys"""
    valid_services = ['eia', 'harvest-hosts', 'google-maps', 'openweather']

    prefs = current_user.preferences or {}
    api_keys = prefs.get('api_keys', {})

    statuses = {}
    for service in valid_services:
        key_info = api_keys.get(service, {})
        statuses[service] = {
            "configured": bool(key_info.get('key')),
            "last_updated": key_info.get('updated_at')
        }

    return statuses
