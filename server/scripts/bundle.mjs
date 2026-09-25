/**
 * 打包 exe 之前，先把 server 连同依赖打成一个 CommonJS 单文件。
 *
 * 为什么要这一步：pkg 的 SEA 模式不会把 ESM 转成 CJS，ESM 入口下它的 VFS
 * 解析不了裸模块名（会报 Cannot find package 'express' / 'dotenv'），
 * 而单文件 + CJS 就没有运行期的模块解析，问题从根上消失。
 * */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const here = import.meta.dirname
const out_dir = path.resolve(here, '../dist-bundle')

await build({
  entryPoints: [path.resolve(here, '../src/index.ts')],
  outfile: path.join(out_dir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  // ws 的这两个是可选的 native 加速件，装了才 require，没装会走 try/catch
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'info'
})

// server/package.json 是 type: module，这里标一下让 Node 把这个目录当 CJS
fs.writeFileSync(
  path.join(out_dir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf-8'
)
console.log('bundle ->', path.join(out_dir, 'index.js'))
