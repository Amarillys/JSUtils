/* eslint-env node */
const fs = require('fs')
const getFileList = require('./lib/getFileList')
const iconvLite = require('iconv-lite')

if (process.argv.length < 3) {
  console.log(`usage: node iconv-node.js [inputPath] [srcEnconding] [dstEncoding] [outputFolder] [filterExtensions]...
    example: node iconv-node.js z:/originalText SHIFT_JIS UTF-8 . h cpp
    . means overwrite inputFile
    you can add bom header in output with specified encoding: utf-8_bom
  `)
  return
}

let argvIndex = 2
const inputPath = process.argv[argvIndex++]
const srcEnconding = process.argv[argvIndex++]
let dstEncoding = process.argv[argvIndex++]
let outputPath = process.argv[argvIndex++]
const filterExtensions = process.argv.slice(argvIndex)
const filesToConv = getFileList(inputPath, false, filterExtensions)
let outputWithBom = false

if (!fs.existsSync(outputPath))
  fs.mkdirSync(outputPath);

if (outputPath === '.') {
  outputPath = inputPath
}

if (dstEncoding === 'utf-8_bom') {
  dstEncoding = 'utf-8'
  outputWithBom = true
}

filesToConv.forEach(file => {
  fs.readFile(`${inputPath}/${file}`, (err, data) => {
    if (err) console.log(err)
    let beforeText = iconvLite.decode(data, srcEnconding)
    let afterText = iconvLite.encode(beforeText, dstEncoding, { addBOM: outputWithBom })
    let outputFilePath = `${outputPath}/${file}`

    fs.mkdir(outputFilePath.slice(0, outputFilePath.lastIndexOf('/')), err => {
      if (err.code !== 'EEXIST') {
        console.log(err)
        return
      }
      fs.writeFile(outputFilePath, afterText, err => err ? console.log(err) : null)
    })
  })
})