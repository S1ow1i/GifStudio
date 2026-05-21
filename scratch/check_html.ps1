$content = [System.IO.File]::ReadAllText("index.html")
$stack = New-Object System.Collections.Generic.List[PSObject]
$line_no = 1
$col_no = 1
$i = 0
$n = $content.Length
$errors = New-Object System.Collections.Generic.List[string]

while ($i -lt $n) {
    $char = $content[$i]
    if ($char -eq "`n") {
        $line_no++
        $col_no = 1
        $i++
        continue
    }
    
    # Check for HTML comments
    if ($char -eq "<" -and ($i + 3) -lt $n -and $content.Substring($i, 4) -eq "<!--") {
        $i += 4
        $col_no += 4
        while ($i -lt $n) {
            if ($content[$i] -eq "`n") {
                $line_no++
                $col_no = 1
                $i++
                continue
            }
            if (($i + 2) -lt $n -and $content.Substring($i, 3) -eq "-->") {
                $i += 3
                $col_no += 3
                break
            }
            $i++
            $col_no++
        }
        continue
    }
    
    # Check for script tag body (ignore tag contents for balanced tags inside script)
    if ($stack.Count -gt 0 -and $stack[$stack.Count-1].Tag -eq "script") {
        if ($char -eq "<" -and ($i + 8) -lt $n -and $content.Substring($i, 9).ToLower() -eq "</script>") {
            $stack.RemoveAt($stack.Count - 1)
            $i += 9
            $col_no += 9
            continue
        }
        $i++
        $col_no++
        continue
    }
    
    # Check for tag
    if ($char -eq "<") {
        $start_col = $col_no
        $start_line = $line_no
        $i++
        $col_no++
        
        $is_closing = $false
        if ($i -lt $n -and $content[$i] -eq "/") {
            $is_closing = $true
            $i++
            $col_no++
        }
        
        $tag_name = ""
        while ($i -lt $n -and $content[$i] -match "[\w-]") {
            $tag_name += $content[$i]
            $i++
            $col_no++
        }
        
        # skip attributes until we find >
        $is_self_closing = $false
        while ($i -lt $n -and $content[$i] -ne ">") {
            if ($content[$i] -eq "/") {
                $is_self_closing = $true
            }
            if ($content[$i] -eq "`n") {
                $line_no++
                $col_no = 1
            } else {
                $col_no++
            }
            $i++
        }
        
        if ($i -lt $n -and $content[$i] -eq ">") {
            $i++
            $col_no++
        }
        
        $tag_name = $tag_name.ToLower()
        
        # Self-closing HTML tags (void elements)
        $void_elements = @("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr")
        
        if ($tag_name -and ($void_elements -contains $tag_name -or $is_self_closing)) {
            # Void or self-closed, do not push to stack
            continue
        }
        
        if ($tag_name) {
            if ($is_closing) {
                if ($stack.Count -eq 0) {
                    $errors.Add("Unexpected closing tag </$tag_name> at line $start_line, col $start_col")
                } else {
                    $top = $stack[$stack.Count - 1]
                    if ($top.Tag -eq $tag_name) {
                        $stack.RemoveAt($stack.Count - 1)
                    } else {
                        $errors.Add("Mismatched closing tag </$tag_name> at line $start_line, col $start_col with <$($top.Tag)> at line $($top.Line), col $($top.Col)")
                        # Unwind stack to see if we can recover
                        $found = $false
                        for ($s = $stack.Count - 1; $s -ge 0; $s--) {
                            if ($stack[$s].Tag -eq $tag_name) {
                                $stack.RemoveRange($s, $stack.Count - $s)
                                $found = $true
                                break
                            }
                        }
                    }
                }
            } else {
                $stack.Add([PSCustomObject]@{ Tag = $tag_name; Line = $start_line; Col = $start_col })
            }
        }
        continue
    }
    
    $i++
    $col_no++
}

while ($stack.Count -gt 0) {
    $top = $stack[$stack.Count - 1]
    $stack.RemoveAt($stack.Count - 1)
    $errors.Add("Unclosed open tag <$($top.Tag)> at line $($top.Line), col $($top.Col)")
}

if ($errors.Count -gt 0) {
    Write-Host "Total HTML errors: $($errors.Count)"
    for ($e = 0; $e -lt [Math]::Min($errors.Count, 15); $e++) {
        Write-Host $errors[$e]
    }
} else {
    Write-Host "HTML structure is perfectly balanced!"
}
