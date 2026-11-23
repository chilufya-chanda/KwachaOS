module.exports = {
  apps: [
    { name: "kwacha-os", script: "npm", args: "start", env: { NODE_ENV: "production" } },
    { name: "kwacha-heartbeat", script: "npm", args: "run heartbeat", env: { NODE_ENV: "production" } }
  ]
};
