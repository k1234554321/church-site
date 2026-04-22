# Deploy to Timeweb Cloud

This project is ready for deployment on a Linux VM in Timeweb Cloud.

## 1) Prepare server

Use Ubuntu 22.04+ and connect via SSH as root:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx mysql-client
```

Install Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

Install PM2 globally:

```bash
npm i -g pm2
pm2 -v
```

## 2) Upload project

Option A (recommended): clone from git.

```bash
mkdir -p /var/www
cd /var/www
git clone <YOUR_GIT_URL> church-site
cd church-site
```

Option B: upload archive via SCP/SFTP into `/var/www/church-site`.

## 3) Install dependencies

```bash
cd /var/www/church-site
npm install --omit=dev
```

## 4) Configure environment

Create production `.env`:

```bash
cp .env.example .env
nano .env
```

Set real values:

- `PORT=3000`
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `ADMIN_LOGIN`, `ADMIN_PASSWORD`
- `JWT_SECRET` (long random value)
- `AUTH_SECRET` (same long random value)

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 5) Prepare MySQL database

Create database and user on your MySQL host, then import schema:

```bash
mysql -h <MYSQL_HOST> -u <MYSQL_USER> -p <MYSQL_DATABASE> < sql/schema.sql
```

## 6) Start app with PM2

```bash
cd /var/www/church-site
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs church-site --lines 100
```

Enable autostart after reboot:

```bash
pm2 startup systemd
pm2 save
```

## 7) Configure Nginx reverse proxy

Copy template:

```bash
cp deploy/timeweb-cloud/nginx-site.conf /etc/nginx/sites-available/church-site
```

Edit domain in config:

```bash
nano /etc/nginx/sites-available/church-site
```

Replace:

- `example.ru` -> your real domain
- `www.example.ru` -> your real domain with `www` (or remove)

Enable site:

```bash
ln -s /etc/nginx/sites-available/church-site /etc/nginx/sites-enabled/church-site
nginx -t
systemctl reload nginx
```

## 8) SSL certificate (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d example.ru -d www.example.ru
```

Certbot auto-renew is usually added automatically. You can test:

```bash
certbot renew --dry-run
```

## 9) Verify after deploy

- Open `https://your-domain`
- Check `https://your-domain/api/health`
- Test:
  - user registration/login
  - account page
  - admin login
  - notes and donations forms

## 10) Update app in future

```bash
cd /var/www/church-site
git pull
npm install --omit=dev
pm2 restart church-site
pm2 save
```

