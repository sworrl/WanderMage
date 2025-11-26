#!/bin/bash

# WanderMage Setup Script
# This script automates the initial setup process

set -e

echo "======================================"
echo "  WanderMage Setup Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
echo ""

# Function to install packages
install_package() {
    local package=$1
    local apt_pkg=${2:-$1}
    local brew_pkg=${3:-$1}
    local dnf_pkg=${4:-$1}

    echo -e "${YELLOW}Installing $package...${NC}"

    case $OS in
        debian)
            sudo apt update
            sudo apt install -y $apt_pkg
            ;;
        fedora)
            sudo dnf install -y $dnf_pkg
            ;;
        arch)
            sudo pacman -S --noconfirm $package
            ;;
        macos)
            brew install $brew_pkg
            ;;
        *)
            echo -e "${RED}Cannot auto-install on this OS. Please install $package manually.${NC}"
            return 1
            ;;
    esac
}

# Check and install PostgreSQL
echo -e "${YELLOW}Checking prerequisites...${NC}"
echo ""

if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}PostgreSQL is not installed.${NC}"
    read -p "Would you like to install PostgreSQL with PostGIS? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        case $OS in
            debian)
                sudo apt update
                sudo apt install -y postgresql postgresql-contrib postgis postgresql-14-postgis-3 || \
                sudo apt install -y postgresql postgresql-contrib postgis postgresql-16-postgis-3
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
                ;;
            fedora)
                sudo dnf install -y postgresql-server postgresql-contrib postgis
                sudo postgresql-setup --initdb
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
                ;;
            macos)
                brew install postgresql@14 postgis
                brew services start postgresql@14
                ;;
            *)
                echo -e "${RED}Please install PostgreSQL with PostGIS manually.${NC}"
                exit 1
                ;;
        esac
        echo -e "${GREEN}PostgreSQL installed!${NC}"
    else
        echo -e "${RED}PostgreSQL is required. Exiting.${NC}"
        exit 1
    fi
fi

# Check and install Python 3
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}Python 3 is not installed.${NC}"
    read -p "Would you like to install Python 3? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        case $OS in
            debian)
                sudo apt update
                sudo apt install -y python3 python3-pip python3-venv
                ;;
            fedora)
                sudo dnf install -y python3 python3-pip python3-virtualenv
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
    else
        echo -e "${RED}Python 3 is required. Exiting.${NC}"
        exit 1
    fi
fi

# Check for python3-venv (needed on some systems)
if ! python3 -m venv --help &> /dev/null; then
    echo -e "${YELLOW}Python venv module not found. Installing...${NC}"
    case $OS in
        debian)
            sudo apt install -y python3-venv
            ;;
    esac
fi

# Check and install Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed.${NC}"
    read -p "Would you like to install Node.js? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        case $OS in
            debian)
                # Install Node.js via NodeSource
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                sudo apt install -y nodejs
                ;;
            fedora)
                sudo dnf install -y nodejs npm
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
    else
        echo -e "${RED}Node.js is required. Exiting.${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}All prerequisites installed!${NC}"
echo ""

# Get database password
echo -e "${YELLOW}Database Setup${NC}"
read -sp "Enter password for PostgreSQL user 'wandermage': " DB_PASSWORD
echo ""

# Create database
echo -e "${YELLOW}Creating database...${NC}"
sudo -u postgres psql <<EOF
CREATE DATABASE wandermage;
CREATE USER wandermage WITH PASSWORD '$DB_PASSWORD';
ALTER DATABASE wandermage OWNER TO wandermage;
GRANT ALL PRIVILEGES ON DATABASE wandermage TO wandermage;
\c wandermage
CREATE EXTENSION IF NOT EXISTS postgis;
EOF

echo -e "${GREEN}Database created successfully!${NC}"
echo ""

# Generate secret key
echo -e "${YELLOW}Generating secret key...${NC}"
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Setup backend
echo -e "${YELLOW}Setting up backend...${NC}"
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file
cat > .env <<EOF
# Database Configuration
DATABASE_URL=postgresql://wandermage:$DB_PASSWORD@localhost:5432/wandermage

# Security
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Application
APP_NAME=WanderMage
DEBUG=True
UPLOAD_DIR=uploads

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
EOF

echo -e "${GREEN}.env file created${NC}"

# Initialize database
echo -e "${YELLOW}Initializing database...${NC}"
python database/init_db.py

# Seed sample data
echo ""
read -p "Would you like to load sample data? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python database/seeds/sample_data.py
    echo -e "${GREEN}Sample data loaded!${NC}"
    echo ""
    echo -e "${GREEN}Demo credentials:${NC}"
    echo "  Username: demo"
    echo "  Password: demo123"
fi

cd ..

# Setup frontend
echo ""
echo -e "${YELLOW}Setting up frontend...${NC}"
cd web-client
npm install
cd ..

echo ""
echo -e "${GREEN}======================================"
echo "  Setup Complete!"
echo "======================================${NC}"
echo ""
echo "To start the application in DEVELOPMENT mode:"
echo ""
echo "1. Run: ./scripts/start.sh"
echo ""
echo "2. Open your browser to: http://localhost:3000"
echo "   API documentation: http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}To DEPLOY for production:${NC}"
echo ""
echo "1. Run: sudo ./scripts/deploy.sh"
echo ""
echo "2. Access at: https://wandermage.localhost"
echo "   (The deploy script sets up hosts file, nginx, and SSL automatically)"
echo ""
echo -e "${GREEN}Happy travels! - WanderMage${NC}"
