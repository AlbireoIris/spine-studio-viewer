// 验证 CrossCore "duplicated-header" 结构：DuplicatedPrefixLength = 83
// 判据（来自官方 codec）：bytes[0..N] == bytes[N..2N] 且 N == 83 → 重复头部
import fs from 'node:fs'
const b = fs.readFileSync('work/raw-pull/luascripts.bin')
const P = 83

const eq = (n) => b.subarray(0, n).equals(b.subarray(n, 2 * n))
console.log('=== 前 N 字节是否与紧随其后的 N 字节相同 ===')
for (const n of [8, 16, 32, 64, 83, 128, 152, 166, 256, 512, 1024]) {
  if (2 * n > b.length) continue
  console.log(`  N=${String(n).padStart(5)}  ${eq(n) ? '✅ 相同（重复头部！）' : '✗'}`)
}
const sig = (o) => JSON.stringify(b.subarray(o, o + 8).toString('latin1'))
console.log('\n=== 关键偏移处的签名 ===')
for (const o of [0, 83, 152, 166, 235, 249]) console.log(`  @${String(o).padStart(4)}  ${sig(o)}   hex=${b.subarray(o, o + 16).toString('hex')}`)
console.log('\n=== 全文件里 "UnityFS" / "nityFS" 出现位置 ===')
const full = [], nity = []
let i = 0
while ((i = b.indexOf(Buffer.from('UnityFS', 'latin1'), i)) >= 0) { full.push(i); i++ }
i = 0
while ((i = b.indexOf(Buffer.from('nityFS', 'latin1'), i)) >= 0) { nity.push(i - 1); i++ }
console.log('  完整 UnityFS:', full.join(', ') || '（无）')
console.log('  nityFS（首字节可能被改）:', nity.join(', ') || '（无）')
console.log('\n=== 前 96 字节 hex（看 83 字节前缀的边界） ===')
for (let o = 0; o < 96; o += 16) console.log(`  @${String(o).padStart(3)}  ${b.subarray(o, o + 16).toString('hex')}`)
