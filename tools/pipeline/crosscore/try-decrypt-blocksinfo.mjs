// A 线决胜实验：用 dump 里的 16 字节十六进制串当密钥，尝试解出 blocksInfo（强校验：块表和≈bundle尺寸）
import fs from 'node:fs'
import crypto from 'node:crypto'

const b = fs.readFileSync('work/raw-pull/luascripts.bin')
const DECL = 25805956                       // bundle 声明尺寸
const CBI = 3868, UBI = 9481                // blocksInfo 压缩/未压缩大小
const HEADER_END = 204

const keys = []
for (const f of ['tools/Il2CppDumper/stringliteral.json']) {
  try {
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/"([0-9a-fA-F]{32})"/g)) keys.push(m[1])
  } catch (e) {}
}
console.log('候选密钥:', keys.join('  '))

/* 校验：能否当块表解析 */
function asTable(buf) {
  if (!buf || buf.length < 12) return null
  const count = buf.readUInt32BE(0)
  if (count < 1 || count > 200000) return null
  if (4 + count * 10 > buf.length) return null
  let sumU = 0, sumC = 0
  for (let i = 0; i < count; i++) {
    const o = 4 + i * 10
    const u = buf.readUInt32BE(o), c = buf.readUInt32BE(o + 4)
    if (u > 64 * 1024 * 1024 || c > 64 * 1024 * 1024) return null
    sumU += u; sumC += c
  }
  return { count, sumU, sumC }
}
const okish = (t) => t && (Math.abs(t.sumU - DECL) < 1024 * 1024 || Math.abs(t.sumC - DECL) < 1024 * 1024)

const tries = []
const keyBufs = keys.map((k) => ({ hex: k, buf: Buffer.from(k, 'hex') }))

/* 位置：头部之后（±16），另外也试文件末尾 */
const offs = []
for (let d = -16; d <= 16; d++) offs.push(HEADER_END + d)
for (let d = -16; d <= 16; d++) offs.push(b.length - CBI + d)

for (const { hex, buf } of keyBufs) {
  for (const off of offs) {
    if (off < 0 || off + CBI > b.length) continue
    const ct = b.subarray(off, off + CBI)
    // ① 原样（若根本未加密）
    tries.push({ name: `raw@${off}`, out: ct })
    // ② AES-128-CBC / ECB，IV 变体
    for (const [ivName, iv] of [['iv0', Buffer.alloc(16)], ['ivkey', buf], ['ivct', ct.subarray(0, 16)]]) {
      for (const mode of ['cbc', 'ecb']) {
        try {
          const d = crypto.createDecipheriv(`aes-128-${mode}`, buf, mode === 'ecb' ? null : iv)
          d.setAutoPadding(false)
          tries.push({ name: `aes128-${mode}/${ivName} key=${hex.slice(0, 8)}…@${off}`, out: Buffer.concat([d.update(ct), d.final()]) })
        } catch (e) {}
      }
    }
    // ③ 16 字节重复 XOR
    const x = Buffer.alloc(ct.length)
    for (let i = 0; i < ct.length; i++) x[i] = ct[i] ^ buf[i % 16]
    tries.push({ name: `xor key=${hex.slice(0, 8)}…@${off}`, out: x })
  }
}
console.log('尝试组合:', tries.length)
let hit = null
for (const t of tries) {
  const tab = asTable(t.out)
  if (tab && okish(tab)) { hit = { ...t, tab }; break }
}
if (hit) {
  console.log(`\n✅✅ 成功！方案=${hit.name}`)
  console.log(`   块数=${hit.tab.count}  未压缩和=${(hit.tab.sumU / 1048576).toFixed(1)}MB  压缩和=${(hit.tab.sumC / 1048576).toFixed(1)}MB`)
} else {
  console.log('\n未命中：这些密钥在该位置/该模式下都解不出合理块表')
  // 报告一下最好的候选（sumU 最接近 DECL 的）
  const scored = tries.map((t) => { const tab = asTable(t.out); return tab ? { name: t.name, tab, d: Math.abs(tab.sumU - DECL) } : null }).filter(Boolean)
  scored.sort((a, b2) => a.d - b2.d)
  scored.slice(0, 6).forEach((s) => console.log(`   候选 ${s.name}  块数=${s.tab.count} 未压缩和=${(s.tab.sumU / 1048576).toFixed(1)}MB 偏差=${(s.d / 1048576).toFixed(1)}MB`))
}
