const fs = require('fs');
let appJs = fs.readFileSync('js/app.js', 'utf8');

// 1. Extract generateId to Utils.js
const utilsCode = `export function generateId() { return 'livello_' + Math.random().toString(36).substr(2, 9); }`;
fs.writeFileSync('js/core/Utils.js', utilsCode);
appJs = appJs.replace(/function generateId\(\) \{[\s\S]*?\n    \}/, '');

// 2. Extract State to State.js
const stateRegex = /const state = (\{[\s\S]*?\n    \});/;
const stateMatch = appJs.match(stateRegex);
if (stateMatch) {
    const stateCode = `import { generateId } from './Utils.js';\n\nexport const state = ${stateMatch[1]};\n`;
    fs.writeFileSync('js/core/State.js', stateCode);
    appJs = appJs.replace(stateMatch[0], ''); // Remove from app.js
} else {
    console.log("State not found!");
}

// 3. Extract DOM to DOM.js
const domRegex = /const dom = (\{[\s\S]*?\n    \});/;
const domMatch = appJs.match(domRegex);
if (domMatch) {
    const domCode = `export const dom = ${domMatch[1]};\n`;
    fs.writeFileSync('js/core/DOM.js', domCode);
    appJs = appJs.replace(domMatch[0], ''); // Remove from app.js
} else {
    console.log("DOM not found!");
}

// 4. Inject imports at top
appJs = `import { generateId } from './core/Utils.js';\nimport { state } from './core/State.js';\nimport { dom } from './core/DOM.js';\n\n` + appJs;

fs.writeFileSync('js/app.js', appJs);
console.log('Done extraction!');
