import type { NextConfig } from 'next'
import path from 'path'
import { tanstackRouter } from '@tanstack/router-plugin/webpack'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd()),
  webpack: (config) => {
    config.plugins.push(
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/(routes)',
        generatedRouteTree: './src/routeTree.gen.ts',
      }),
    )
    return config
  },
}

export default nextConfig
