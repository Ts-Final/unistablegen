/**
 * 给 pkg 生成的 unistablegen.exe 注入图标和版本信息。
 *
 * pkg 自己不提供这个能力（官方文档的做法就是打包后用 resedit 后处理），
 * 而 SEA 模式的 exe 里除了 PE 资源还有 postject 塞进去的 blob，
 * 所以这里注入前后都会确认 blob 还在，避免把 exe 改成一跑就报错。
 * */
import * as ResEdit from 'resedit'
import fs from 'node:fs'
import path from 'node:path'

const here = import.meta.dirname
const exe_path = path.resolve(here, '../../build/unistablegen.exe')
const ico_path = path.resolve(here, '../../frontend/public/icon.ico')
const pkg_json = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf-8'))
const version = String(pkg_json.version ?? '1.0.0')

if (!fs.existsSync(exe_path)) throw new Error(`找不到 ${exe_path}，请先跑 pkg`)
if (!fs.existsSync(ico_path)) throw new Error(`找不到 ${ico_path}（图标文件）`)

/** postject 把 SEA blob 作为 PE 资源塞进去，资源名是 UTF-16LE 的 */
const SEA_MARK = Buffer.from('NODE_SEA_BLOB', 'utf16le')

const before = fs.readFileSync(exe_path)
const had_mark = before.includes(SEA_MARK)
if (!had_mark) console.warn('[icon] 注入前没找到 NODE_SEA_BLOB 标记，跳过 blob 校验')

const nt = ResEdit.NtExecutable.from(before, { ignoreCert: true })
const res = ResEdit.NtExecutableResource.from(nt)

// ---- 图标：主图标组的 ID 是 1 ----
const icon_file = ResEdit.Data.IconFile.from(fs.readFileSync(ico_path))
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  1,
  1033,
  icon_file.icons.map((i) => i.data)
)

// ---- 版本信息 ----
const vi_list = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
if (vi_list.length) {
  const vi = vi_list[0]
  const lang = 1033
  const codepage = 1200
  const [major, minor, patch] = version.split('.').map((v) => Number(v) || 0)
  vi.setFileVersion(major, minor, patch, 0, lang)
  vi.setProductVersion(major, minor, patch, 0, lang)
  vi.setStringValues(
    { lang, codepage },
    {
      FileDescription: 'unistablegen',
      ProductName: 'unistablegen',
      CompanyName: 'unistablegen',
      ProductVersion: version,
      FileVersion: version,
      OriginalFilename: 'unistablegen.exe',
      LegalCopyright: 'unistablegen'
    }
  )
  vi.outputToResourceEntries(res.entries)
} else {
  console.warn('[icon] exe 里没有版本信息资源，只注入图标')
}

res.outputResource(nt)
const after = Buffer.from(nt.generate())
fs.writeFileSync(exe_path, after)

// ---- 注入后校验 ----
if (had_mark && !after.includes(SEA_MARK)) {
  throw new Error('注入后 SEA blob 不见了：这个 exe 会跑不起来，请检查 resedit 版本')
}
if (after.length < before.length) {
  throw new Error(`注入后体积反而变小了（${before.length} -> ${after.length}），可疑`)
}
console.log(
  `🎨 icon + version -> ${exe_path}（${icon_file.icons.length} 个尺寸，${before.length} -> ${after.length} 字节）`
)
