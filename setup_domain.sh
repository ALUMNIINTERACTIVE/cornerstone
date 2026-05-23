#!/usr/bin/env bash

# ==============================================================================
# 🌐 CORNERSTONE INSURANCE - DOMAIN EXPANSION ENGINE (chatcif.com Routing)
# Target OS: Ubuntu 22.04 / 24.04 LTS (AWS EC2)
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
echo -e "${CYAN}🌐  CORNERSTONE DOMAIN EXPANSION ENGINE INITIATING${NC}"
echo -e "${CYAN}================================================================${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Please run this script with sudo privileges:${NC}"
  echo -e "   sudo ./setup_domain.sh"
  exit 1
fi

# 1. Update Nginx Configuration
echo -e "\n${YELLOW}[1/3] Updating Nginx configuration to add chatcif.com...${NC}"
NGINX_CONF="/etc/nginx/sites-available/cornerstone"

# Backup Nginx config
cp "$NGINX_CONF" "${NGINX_CONF}.bak"

# Generate new Nginx site configuration
cat <<EOT > "$NGINX_CONF"
server {
    server_name cornerstoneinsurancefirm.com www.cornerstoneinsurancefirm.com chatcif.com www.chatcif.com;

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

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/cornerstoneinsurancefirm.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/cornerstoneinsurancefirm.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if (\$host = www.cornerstoneinsurancefirm.com) {
        return 301 https://\$host\$request_uri;
    } # managed by Certbot

    if (\$host = cornerstoneinsurancefirm.com) {
        return 301 https://\$host\$request_uri;
    } # managed by Certbot

    if (\$host = www.chatcif.com) {
        return 301 https://\$host\$request_uri;
    } # managed by Certbot

    if (\$host = chatcif.com) {
        return 301 https://\$host\$request_uri;
    } # managed by Certbot

    listen 80;
    server_name cornerstoneinsurancefirm.com www.cornerstoneinsurancefirm.com chatcif.com www.chatcif.com;
    return 404; # managed by Certbot
}
EOT

# Test and reload Nginx
nginx -t
systemctl reload nginx
echo -e "${GREEN}✓ Nginx successfully updated to receive traffic for chatcif.com!${NC}"

# 2. Let's Encrypt Certificate Expansion
echo -e "\n${YELLOW}[2/3] Generating expanded Let's Encrypt SSL certificate...${NC}"
echo -e "Expanding SSL credentials for cornerstoneinsurancefirm.com and chatcif.com..."

certbot --nginx --non-interactive --agree-tos --expand \
  -d cornerstoneinsurancefirm.com \
  -d www.cornerstoneinsurancefirm.com \
  -d chatcif.com \
  -d www.chatcif.com

echo -e "${GREEN}✓ SSL certificate successfully expanded! All domains now support secure HTTPS.${NC}"

# 3. Reload Nginx
echo -e "\n${YELLOW}[3/3] Completing final security restart...${NC}"
systemctl restart nginx
echo -e "${GREEN}✓ Nginx successfully restarted with absolute SSL bindings!${NC}"

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 CONGRATULATIONS! DOMAIN EXPANSION COMPLETE FLAWLESSLY!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "🔗 Main Portal (Active): https://chatcif.com"
echo -e "📊 Agent Portal:         https://chatcif.com/admin.html"
echo -e "================================================================\n"
