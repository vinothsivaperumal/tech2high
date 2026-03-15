# EC2 Manual Deployment

This project can run directly on an EC2 instance with Node.js and PM2.

## 1. SSH to the instance

From your local machine:

```bash
ssh -i deploy/keys/narpavi-n8n-key.pem ubuntu@54.145.201.227
```

If your AMI uses a different default user, replace `ubuntu` with `ec2-user`.

## 2. First-time server bootstrap

Run these commands on the EC2 instance terminal:

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential postgresql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
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
rsync -avz --delete --exclude node_modules --exclude .next --exclude dist --exclude deploy/keys -e "ssh -i deploy/keys/narpavi-n8n-key.pem" ./ ubuntu@54.145.201.227:/var/www/tech2high/
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