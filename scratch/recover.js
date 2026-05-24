const fs = require('fs');
const lines = fs.readFileSync('C:/Users/Matte/.gemini/antigravity/brain/2c6f792e-4142-4110-a738-b8e472549ad9/.system_generated/logs/transcript.jsonl', 'utf-8').split('\n');
let original = fs.readFileSync('C:/Users/Matte/Desktop/Progetto/js/app.js', 'utf-8');

for(let l of lines) {
    if(!l) continue;
    const j = JSON.parse(l);
    if(j.tool_calls) {
        for(let tc of j.tool_calls) {
            if(tc.function && tc.function.name === 'default_api:multi_replace_file_content' && tc.function.arguments) {
                try {
                    const args = JSON.parse(tc.function.arguments);
                    if(args.TargetFile && args.TargetFile.endsWith('app.js')) {
                        console.log('Applying patch to app.js...');
                        for(let chunk of args.ReplacementChunks) {
                            original = original.replace(chunk.TargetContent, chunk.ReplacementContent);
                        }
                    }
                } catch(e) {
                    console.log('Truncated JSON!');
                }
            }
        }
    }
}
fs.writeFileSync('C:/Users/Matte/Desktop/Progetto/js/app_recovered.js', original);
console.log('Done!');
