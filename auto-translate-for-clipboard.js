import translate from "@vitalets/google-translate-api"
import clipboard from "clipboardy";

(function main() {
  let lastText = ''
  setInterval(async () => {
    let result = ''
    try {
      let clipText = await clipboard.read()
      if (!clipText) return
      if (clipText == lastText) return
      lastText = clipText
      result = (await translate(clipText, { to: 'ko' })).text
      clipboard.write(result)
      lastText = result
      console.log(`${clipText} to ${result}`)
    } catch(err) {
      // console.error(err)
    }
  }, 300)
})();
