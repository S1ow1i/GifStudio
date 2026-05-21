def check_balancing(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    line_no = 1
    col_no = 1
    
    in_string = False
    string_char = None
    in_comment = False
    in_line_comment = False
    
    errors = []
    
    i = 0
    n = len(content)
    while i < n:
        char = content[i]
        
        # Track line and column numbers
        if char == '\n':
            line_no += 1
            col_no = 1
        else:
            col_no += 1
            
        # Handle line comment
        if in_line_comment:
            if char == '\n':
                in_line_comment = False
            i += 1
            continue
            
        # Handle block comment
        if in_comment:
            if char == '*' and i + 1 < n and content[i + 1] == '/':
                in_comment = False
                i += 2
                col_no += 1
                continue
            i += 1
            continue
            
        # Handle comments start
        if not in_string:
            if char == '/' and i + 1 < n and content[i + 1] == '/':
                in_line_comment = True
                i += 2
                col_no += 1
                continue
            if char == '/' and i + 1 < n and content[i + 1] == '*':
                in_comment = True
                i += 2
                col_no += 1
                continue
                
        # Handle strings
        if in_string:
            # Handle escapes
            if char == '\\':
                i += 2
                col_no += 1
                continue
            if char == string_char:
                in_string = False
            i += 1
            continue
        else:
            if char in ("'", '"', '`'):
                in_string = True
                string_char = char
                i += 1
                continue
                
        # Bracket matching
        if char in ('(', '[', '{'):
            stack.append((char, line_no, col_no))
        elif char in (')', ']', '}'):
            if not stack:
                errors.append(f"Unexpected closing {char} at line {line_no}, col {col_no}")
            else:
                top, t_line, t_col = stack.pop()
                if (char == ')' and top != '(') or \
                   (char == ']' and top != '[') or \
                   (char == '}' and top != '{'):
                    errors.append(f"Mismatched closing {char} at line {line_no}, col {col_no} with {top} at line {t_line}, col {t_col}")
                    
        i += 1
        
    while stack:
        top, t_line, t_col = stack.pop()
        errors.append(f"Unclosed open {top} at line {t_line}, col {t_col}")
        
    if errors:
        print(f"Total syntax errors: {len(errors)}")
        for err in errors[:10]:
            print(err)
    else:
        print("Syntactically balanced brackets and braces!")

if __name__ == '__main__':
    check_balancing('js/app.js')
