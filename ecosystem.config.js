module.exports = {
  apps: [
    {
      name: 'psyduck-bot',
      cwd: './bot',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      max_memory_restart: '200M',
    },
    {
      name: 'psyduck-card',
      cwd: './card-server',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      max_restarts: 10,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      max_memory_restart: '200M',
    },
  ],
}
