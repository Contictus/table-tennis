import { readFile, writeFile } from 'node:fs/promises'
import { compile } from 'json-schema-to-typescript'

const schemaPath = new URL('../../protocol/schema/messages.json', import.meta.url)
const outputPath = new URL('../src/types/generated-protocol.d.ts', import.meta.url)
const sourceSchema = JSON.parse(await readFile(schemaPath, 'utf8'))
const schema = {
  ...sourceSchema,
  title: 'TableTennisProtocol',
  oneOf: [
    { $ref: '#/definitions/ClientMessage' },
    { $ref: '#/definitions/ServerMessage' },
  ],
}
const output = await compile(schema, 'TableTennisProtocol', { bannerComment: '// Generated from protocol/schema/messages.json. Do not edit.' })
await writeFile(outputPath, output)
console.log(`Generated ${outputPath.pathname}`)
