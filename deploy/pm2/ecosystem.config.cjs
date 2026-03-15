module.exports = {
  apps: [
    {
      name: "tech2high-api",
      cwd: "/var/www/tech2high",
      script: "npm",
      args: "run start:api",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "tech2high-web",
      cwd: "/var/www/tech2high",
      script: "npm",
      args: "run start:web",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    }
  ]
};