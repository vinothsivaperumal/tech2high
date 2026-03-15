# EC2 Manual Deployment

This project can run directly on an EC2 instance with Node.js and PM2.

## 1. Connect to the instance

From your local machine:

```bash
ssh -i deploy/keys/narpavi-n8n-key.pem ec2-user@54.145.201.227
```

For Amazon Linux, the default user is usually `ec2-user`.

If you are using the AWS Console `Connect` button, choose `EC2 Instance Connect` and open the browser terminal. Then run the same server-side commands from the sections below.

## 2. First-time server bootstrap

Run these commands on the EC2 instance terminal for Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential postgresql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
sudo mkdir -p /var/www/tech2high
sudo chown -R "$USER":"$USER" /var/www/tech2high
```

Run these commands on the EC2 instance terminal for Amazon Linux:

```bash
sudo dnf install -y curl git gcc-c++ make postgresql15
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
sudo npm install -g pm2
sudo mkdir -p /var/www/tech2high
sudo chown -R "$USER":"$USER" /var/www/tech2high
```

## 3. Get the code onto the instance

If the GitHub repo is public:

```bash
git clone https://github.com/vinothsivaperumal/tech2high.git /var/www/tech2high
```

If the GitHub repo is private, upload from your local machine instead:

```bash
rsync -avz --delete --exclude node_modules --exclude .next --exclude dist --exclude deploy/keys --exclude .git -e "ssh -i deploy/keys/narpavi-n8n-key.pem" ./ ec2-user@54.145.201.227:/var/www/tech2high/
```

## 4. Create production env file on EC2

On the EC2 instance:

```bash
cd /var/www/tech2high
cp .env.example .env
nano .env
```

Set production values at minimum for:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `NEXT_PUBLIC_API_BASE_URL`
- `AWS_*`
- `SMTP_*`

## 5. Deploy from the EC2 terminal

On the EC2 instance:

```bash
cd /var/www/tech2high
npm ci
npm run build
npm run deploy:sql:manual
pm2 startOrReload deploy/pm2/ecosystem.config.cjs --update-env
pm2 save
```

Or use the reusable script:

```bash
cd /var/www/tech2high
chmod +x deploy/scripts/ec2-bootstrap.sh deploy/scripts/ec2-deploy.sh
RUN_SCHEMA_SYNC=true bash deploy/scripts/ec2-deploy.sh
```

If you uploaded files with `rsync` or the AWS Console instead of cloning with git, use:

```bash
cd /var/www/tech2high
chmod +x deploy/scripts/ec2-bootstrap.sh deploy/scripts/ec2-deploy.sh
SKIP_GIT=true RUN_SCHEMA_SYNC=true bash deploy/scripts/ec2-deploy.sh
```

## 6. Verify

On the EC2 instance:

```bash
pm2 status
curl http://127.0.0.1:4000/health
curl -I http://127.0.0.1:3000
```

From your browser:

- `http://54.145.201.227:3000`
- `http://54.145.201.227:4000/health`