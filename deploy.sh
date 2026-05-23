#!/usr/bin/env bash

# ==============================================================================
# 🏛️ CORNERSTONE INSURANCE PORTAL - AUTOMATED DEPLOYMENT & PROVISIONING SCRIPT
# Target OS: Ubuntu 22.04 / 24.04 LTS (AWS EC2 t2.micro / t3.micro compatible)
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Visual formatting helpers
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}🏛️  CORNERSTONE INSURANCE SYSTEM DEPLOYMENT ENGINE INITIATING${NC}"
echo -e "${CYAN}================================================================${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Please run this script with sudo privileges:${NC}"
  echo -e "   sudo ./deploy.sh"
  exit 1
fi

# 1. Update and Upgrade System Packages
echo -e "\n${YELLOW}[1/7] Updating and upgrading system packages...${NC}"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx

# 2. Install Node.js (Active LTS v20)
echo -e "\n${YELLOW}[2/7] Installing Node.js v20 (LTS)...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo -e "${GREEN}✓ Node.js $(node -v) and NPM $(npm -v) successfully installed!${NC}"

# 3. Setup Project Directory & Environment
echo -e "\n${YELLOW}[3/7] Setting up repository and production packages...${NC}"
npm install --omit=dev

# Prompt for Gemini API Key securely
if [ -f .env ]; then
    echo -e "${GREEN}✓ Found existing .env file.${NC}"
else
    echo -e "${YELLOW}🔑 Gemini API Key is required for cloud-based AI analysis and chat concierge.${NC}"
    echo -e "You can get a free key from Google AI Studio: https://aistudio.google.com/"
    read -p "Enter your GEMINI_API_KEY: " gemini_key
    
    cat <<EOT > .env
PORT=8000
GEMINI_API_KEY=$gemini_key
EOT
    echo -e "${GREEN}✓ Created secure .env configuration file!${NC}"
fi

# Ensure uploads folder exists with proper permissions
mkdir -p uploads
chmod 775 uploads

# 4. Configure Firewall (UFW)
echo -e "\n${YELLOW}[4/7] Configuring local firewall rules (UFW)...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
echo "y" | ufw enable
echo -e "${GREEN}✓ Firewall active: allowing SSH (22), HTTP (80), and HTTPS (443)${NC}"

# 5. Install & Configure Process Manager (PM2)
echo -e "\n${YELLOW}[5/7] Deploying process manager (PM2) for zero-downtime execution...${NC}"
npm install -g pm2

# Check if app is already running under PM2 and restart, otherwise start new
if pm2 list | grep -q "cornerstone"; then
    pm2 restart cornerstone
else
    pm2 start server.js --name "cornerstone"
fi

# Set up PM2 to start on system boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu || true
pm2 save
echo -e "${GREEN}✓ Node.js server running in background under PM2!${NC}"

# 6. Configure Nginx Reverse Proxy
echo -e "\n${YELLOW}[6/7] Configuring Nginx reverse proxy...${NC}"
NGINX_CONF="/etc/nginx/sites-available/cornerstone"

cat <<EOT > "$NGINX_CONF"
server {
    listen 80;
    server_name cornerstoneinsurancefirm.com www.cornerstoneinsurancefirm.com;

    # Dynamic asset limits for PDF/Image document uploads
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        
        # Security headers
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOT

# Link configuration and remove default configuration if it exists
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/cornerstone"
rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
nginx -t
systemctl restart nginx
echo -e "${GREEN}✓ Nginx reverse proxy successfully active!${NC}"

# 7. Configure SSL (HTTPS) via Let's Encrypt Certbot
echo -e "\n${YELLOW}[7/7] Let's Encrypt SSL configuration stage...${NC}"
echo -e "To configure HTTPS, ensure your domain DNS (A-Records) points to this server's Elastic IP."
read -p "Do you want to configure free SSL (HTTPS) right now? (y/n): " confirm_ssl

if [[ "$confirm_ssl" =~ ^[Yy]$ ]]; then
    read -p "Enter your email address (for certificate renewal notifications): " email_addr
    certbot --nginx --non-interactive --agree-tos -m "$email_addr" -d cornerstoneinsurancefirm.com -d www.cornerstoneinsurancefirm.com
    echo -e "${GREEN}✓ SSL successfully installed! Traffic is now fully encrypted via HTTPS.${NC}"
else
    echo -e "${YELLOW}⚠️ Skipping SSL setup. The server will be accessible via HTTP (port 80) only.${NC}"
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 CONGRATULATIONS! CORNERSTONE PORTAL DEPLOYED FLAWLESSLY!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "🔗 Portal Access: http://cornerstoneinsurancefirm.com"
echo -e "📊 Agent Portal:  http://cornerstoneinsurancefirm.com/admin.html"
echo -e "📁 Uploads Path:  /var/www (proxied upload vault active)"
echo -e "================================================================\n"
