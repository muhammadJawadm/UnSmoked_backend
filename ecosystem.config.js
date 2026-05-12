module.exports = {
  apps: [
    {
      name: 'unsmoked-backend',
      script: 'server.js',            // ✅ root level, not src/
      watch: true,
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log'
      ],
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};