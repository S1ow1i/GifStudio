import re
import base64

with open('js/lib/gif.worker.b64.js', 'r', encoding='utf-8') as f:
    content = f.read()

match = re.search(r'"([^"]+)"', content)
if match:
    b64_str = match.group(1)
    decoded = base64.b64decode(b64_str).decode('utf-8')
    with open('scratch/decoded_worker.js', 'w', encoding='utf-8') as f_out:
        f_out.write(decoded)
    print("Successfully decoded worker to scratch/decoded_worker.js")
else:
    print("Could not find base64 string in gif.worker.b64.js")
