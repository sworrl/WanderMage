#!/bin/bash

# WanderMage Production Deployment Script
# This script deploys the application to a production server

set -e  # Exit on error

echo "====== WanderMage Deployment ======"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}"
   exit 1
fi

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt &> /dev/null; then
            echo "debian"
        elif command -v dnf &> /dev/null; then
            echo "fedora"
        elif command -v pacman &> /dev/null; then
            echo "arch"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
echo -e "${YELLOW}Detected OS: $OS${NC}"

# ============================================
# CONFIGURATION - Edit these values as needed
# ============================================
APP_DIR="/opt/wandermage"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"  # Parent of scripts directory
USER="${SUDO_USER:-$(whoami)}"  # Use the user who ran sudo, or current user
DOMAIN="wandermage.localhost"
# ============================================

BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
UPLOADS_DIR="$APP_DIR/uploads"

echo ""
echo "Configuration:"
echo "  Source: $SRC_DIR"
echo "  Target: $APP_DIR"
echo "  User: $USER"
echo "  Domain: $DOMAIN"
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# ============================================
# Install dependencies
# ============================================
echo ""
echo -e "${YELLOW}Step 1: Checking and installing dependencies...${NC}"

# Install nginx if not present
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Installing nginx...${NC}"
    case $OS in
        debian)
            apt update
            apt install -y nginx
            ;;
        fedora)
            dnf install -y nginx
            ;;
        arch)
            pacman -S --noconfirm nginx
            ;;
        macos)
            brew install nginx
            ;;
        *)
            echo -e "${RED}Please install nginx manually.${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}nginx installed!${NC}"
fi

# Install Python 3 if not present
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}Installing Python 3...${NC}"
    case $OS in
        debian)
            apt update
            apt install -y python3 python3-pip python3-venv
            ;;
        fedora)
            dnf install -y python3 python3-pip python3-virtualenv
            ;;
        arch)
            pacman -S --noconfirm python python-pip
            ;;
        macos)
            brew install python3
            ;;
        *)
            echo -e "${RED}Please install Python 3 manually.${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}Python 3 installed!${NC}"
fi

# Install python3-venv if needed (Debian/Ubuntu specific)
if [[ "$OS" == "debian" ]] && ! python3 -m venv --help &> /dev/null; then
    echo -e "${YELLOW}Installing python3-venv...${NC}"
    apt install -y python3-venv
fi

# Install Node.js if not present (needed for building frontend)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    case $OS in
        debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt install -y nodejs
            ;;
        fedora)
            dnf install -y nodejs npm
            ;;
        arch)
            pacman -S --noconfirm nodejs npm
            ;;
        macos)
            brew install node
            ;;
        *)
            echo -e "${RED}Please install Node.js manually.${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}Node.js installed!${NC}"
fi

# Install openssl if not present
if ! command -v openssl &> /dev/null; then
    echo -e "${YELLOW}Installing openssl...${NC}"
    case $OS in
        debian)
            apt install -y openssl
            ;;
        fedora)
            dnf install -y openssl
            ;;
        arch)
            pacman -S --noconfirm openssl
            ;;
        macos)
            brew install openssl
            ;;
    esac
    echo -e "${GREEN}openssl installed!${NC}"
fi

# Install curl if not present (needed for some operations)
if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}Installing curl...${NC}"
    case $OS in
        debian)
            apt install -y curl
            ;;
        fedora)
            dnf install -y curl
            ;;
        arch)
            pacman -S --noconfirm curl
            ;;
    esac
fi

echo -e "${GREEN}All dependencies installed!${NC}"

# ============================================
# Create directory structure
# ============================================
echo ""
echo -e "${YELLOW}Step 2: Creating directory structure...${NC}"
mkdir -p $APP_DIR
mkdir -p $BACKEND_DIR
mkdir -p $FRONTEND_DIR
mkdir -p $UPLOADS_DIR

# ============================================
# Copy backend files
# ============================================
echo -e "${YELLOW}Step 3: Copying backend files...${NC}"
cp -r "$SRC_DIR/backend/app" $BACKEND_DIR/
cp -r "$SRC_DIR/backend/database" $BACKEND_DIR/
cp "$SRC_DIR/backend/requirements.txt" $BACKEND_DIR/
if [ -f "$SRC_DIR/backend/.env" ]; then
    cp "$SRC_DIR/backend/.env" $BACKEND_DIR/
    echo "  .env file copied"
else
    echo -e "  ${YELLOW}WARNING: .env not found - you'll need to create it manually${NC}"
    echo "  Copy backend/.env.example to $BACKEND_DIR/.env and configure it"
fi

# ============================================
# Setup Python virtual environment
# ============================================
echo -e "${YELLOW}Step 4: Setting up Python virtual environment...${NC}"
cd $BACKEND_DIR
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn  # Production WSGI server
deactivate

# ============================================
# Build and copy frontend
# ============================================
echo -e "${YELLOW}Step 5: Building and copying frontend...${NC}"
if [ -d "$SRC_DIR/web-client/dist" ]; then
    cp -r "$SRC_DIR/web-client/dist/"* $FRONTEND_DIR/
    echo "  Copied pre-built frontend"
else
    echo "  Building frontend..."
    cd "$SRC_DIR/web-client"
    npm install
    npm run build
    cp -r dist/* $FRONTEND_DIR/
    echo "  Frontend built and copied"
fi

# ============================================
# Set ownership
# ============================================
echo -e "${YELLOW}Step 6: Setting ownership...${NC}"
chown -R $USER:$USER $APP_DIR

# ============================================
# Create systemd service
# ============================================
echo -e "${YELLOW}Step 7: Creating systemd service...${NC}"
cat > /etc/systemd/system/wandermage.service <<EOF
[Unit]
Description=WanderMage Backend Service
After=network.target postgresql.service

[Service]
Type=notify
User=$USER
Group=$USER
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/venv/bin"
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=$BACKEND_DIR/venv/bin/gunicorn app.main:app --bind 127.0.0.1:8000 --workers 4 --worker-class uvicorn.workers.UvicornWorker --access-logfile /var/log/wandermage/access.log --error-logfile /var/log/wandermage/error.log
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# ============================================
# Create log directory
# ============================================
echo -e "${YELLOW}Step 8: Creating log directory...${NC}"
mkdir -p /var/log/wandermage
chown $USER:$USER /var/log/wandermage

# ============================================
# Add hosts file entry
# ============================================
echo -e "${YELLOW}Step 9: Adding hosts file entry...${NC}"
if ! grep -q "$DOMAIN" /etc/hosts; then
    echo "127.0.0.1 $DOMAIN" >> /etc/hosts
    echo "  Added $DOMAIN to /etc/hosts"
else
    echo "  $DOMAIN already in /etc/hosts"
fi

# ============================================
# Create SSL certificate and ensure-ssl service
# ============================================
echo -e "${YELLOW}Step 10: Creating SSL certificate...${NC}"
mkdir -p $APP_DIR/ssl

# Create the SSL cert generation script (used by systemd on boot)
cat > $APP_DIR/ssl/ensure-ssl.sh <<'SSLSCRIPT'
#!/bin/bash
# Ensures SSL certificates exist for WanderMage
SSL_DIR="/opt/wandermage/ssl"
DOMAIN="wandermage.localhost"

if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
    echo "SSL certificates missing, generating..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$SSL_DIR/key.pem" \
      -out "$SSL_DIR/cert.pem" \
      -subj "/C=US/ST=State/L=City/O=WanderMage/CN=$DOMAIN" 2>/dev/null
    echo "SSL certificates generated."
else
    echo "SSL certificates exist."
fi
SSLSCRIPT
chmod +x $APP_DIR/ssl/ensure-ssl.sh

# Create systemd service that runs before nginx to ensure SSL certs exist
cat > /etc/systemd/system/wandermage-ssl.service <<EOF
[Unit]
Description=Ensure WanderMage SSL certificates exist
Before=nginx.service
Wants=nginx.service

[Service]
Type=oneshot
ExecStart=$APP_DIR/ssl/ensure-ssl.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Generate initial SSL cert if needed
if [ ! -f "$APP_DIR/ssl/cert.pem" ] || [ ! -f "$APP_DIR/ssl/key.pem" ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout $APP_DIR/ssl/key.pem \
      -out $APP_DIR/ssl/cert.pem \
      -subj "/C=US/ST=State/L=City/O=WanderMage/CN=$DOMAIN"
    echo "  Generated self-signed SSL certificate"
else
    echo "  SSL certificate already exists"
fi
chown -R $USER:$USER $APP_DIR/ssl

# ============================================
# Create nginx configuration
# ============================================
echo -e "${YELLOW}Step 11: Creating nginx configuration...${NC}"

# Determine nginx sites directory
if [ -d "/etc/nginx/sites-available" ]; then
    NGINX_SITES="/etc/nginx/sites-available"
    NGINX_ENABLED="/etc/nginx/sites-enabled"
elif [ -d "/etc/nginx/conf.d" ]; then
    NGINX_SITES="/etc/nginx/conf.d"
    NGINX_ENABLED="/etc/nginx/conf.d"
else
    echo -e "${RED}Cannot find nginx configuration directory${NC}"
    exit 1
fi

cat > $NGINX_SITES/wandermage.conf <<EOF
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name $DOMAIN;

    ssl_certificate $APP_DIR/ssl/cert.pem;
    ssl_certificate_key $APP_DIR/ssl/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 20M;

    # Frontend
    location / {
        root $FRONTEND_DIR;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Uploads
    location /uploads {
        alias $UPLOADS_DIR;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable the site (for Debian-style nginx)
if [ -d "/etc/nginx/sites-enabled" ]; then
    ln -sf $NGINX_SITES/wandermage.conf $NGINX_ENABLED/wandermage.conf
fi

# ============================================
# Copy and setup scraper services
# ============================================
echo -e "${YELLOW}Step 12: Setting up scraper services...${NC}"
mkdir -p $APP_DIR/scrapers
cp -r "$SRC_DIR/scrapers/"* $APP_DIR/scrapers/ 2>/dev/null || echo "  No scrapers directory in source"
chown -R $USER:$USER $APP_DIR/scrapers
chmod 755 $APP_DIR/scrapers/*.py 2>/dev/null || true

# Create master controller service
cat > /etc/systemd/system/wandermage-scraper-master.service <<EOF
[Unit]
Description=WanderMage Scraper Master Controller
After=network.target wandermage.service postgresql.service
Wants=wandermage.service

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR/scrapers
EnvironmentFile=$BACKEND_DIR/.env
Environment="PATH=$BACKEND_DIR/venv/bin:/usr/bin:/bin"
ExecStart=$BACKEND_DIR/venv/bin/python3 $APP_DIR/scrapers/master_controller.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create POI scraper service
cat > /etc/systemd/system/wandermage-scraper-poi.service <<EOF
[Unit]
Description=WanderMage POI Scraper
After=network.target postgresql.service

[Service]
Type=oneshot
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR/scrapers
EnvironmentFile=$BACKEND_DIR/.env
Environment="PATH=$BACKEND_DIR/venv/bin:/usr/bin:/bin"
ExecStart=$BACKEND_DIR/venv/bin/python3 $APP_DIR/scrapers/poi_scraper.py
TimeoutStartSec=3600
RemainAfterExit=no
EOF

# Create fuel scraper service
cat > /etc/systemd/system/wandermage-scraper-fuel.service <<EOF
[Unit]
Description=WanderMage Fuel Prices Scraper
After=network.target postgresql.service

[Service]
Type=oneshot
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR/scrapers
EnvironmentFile=$BACKEND_DIR/.env
Environment="PATH=$BACKEND_DIR/venv/bin:/usr/bin:/bin"
ExecStart=$BACKEND_DIR/venv/bin/python3 $APP_DIR/scrapers/fuel_scraper.py
TimeoutStartSec=300
RemainAfterExit=no
EOF

# Create maintenance service and timer
cat > /etc/systemd/system/wandermage-maintenance.service <<EOF
[Unit]
Description=WanderMage Data Maintenance
After=network.target postgresql.service
Conflicts=wandermage-scraper-poi.service wandermage-scraper-fuel.service

[Service]
Type=oneshot
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR/scrapers
EnvironmentFile=$BACKEND_DIR/.env
Environment="PATH=$BACKEND_DIR/venv/bin:/usr/bin:/bin"
ExecStart=$BACKEND_DIR/venv/bin/python3 $APP_DIR/scrapers/maintenance_runner.py full
TimeoutStartSec=1800
EOF

cat > /etc/systemd/system/wandermage-maintenance.timer <<EOF
[Unit]
Description=Run WanderMage maintenance daily

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=1800
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "  Scraper services created"

# ============================================
# Test and reload services
# ============================================
echo -e "${YELLOW}Step 13: Testing nginx configuration...${NC}"
nginx -t

echo -e "${YELLOW}Step 14: Reloading services...${NC}"
systemctl daemon-reload
systemctl enable wandermage-ssl
systemctl start wandermage-ssl
systemctl enable wandermage
systemctl restart wandermage || echo -e "${YELLOW}Note: Service may fail if .env is missing${NC}"
systemctl enable wandermage-scraper-master
systemctl restart wandermage-scraper-master || echo -e "${YELLOW}Note: Scraper master may fail if .env is missing${NC}"
systemctl enable wandermage-maintenance.timer
systemctl start wandermage-maintenance.timer
systemctl enable nginx
systemctl reload nginx

echo ""
echo -e "${GREEN}====== Deployment Complete! ======${NC}"
echo ""
echo "Services status:"
systemctl status wandermage --no-pager || true
echo ""
echo "To view logs:"
echo "  sudo journalctl -u wandermage -f"
echo "  sudo tail -f /var/log/wandermage/error.log"
echo ""
echo "Application is available at:"
echo "  https://$DOMAIN"
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "  https://$LOCAL_IP (if firewall allows)"
echo ""
echo -e "${YELLOW}Note: If using self-signed certificate, you'll need to accept the security warning in your browser.${NC}"
echo ""
