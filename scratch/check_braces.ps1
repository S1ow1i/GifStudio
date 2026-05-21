$content = [System.IO.File]::ReadAllText("js/app.js")
$stack = New-Object System.Collections.Generic.List[PSObject]
$line_no = 1
$col_no = 1
$in_string = $false
$string_char = $null
$in_comment = $false
$in_line_comment = $false
$errors = New-Object System.Collections.Generic.List[string]

$i = 0
$n = $content.Length
while ($i -lt $n) {
    $char = $content[$i]
    if ($char -eq "`n") {
        $line_no++
        $col_no = 1
    } else {
        $col_no++
    }
    
    if ($in_line_comment) {
        if ($char -eq "`n") { $in_line_comment = $false }
        $i++
        continue
    }
    if ($in_comment) {
        if ($char -eq "*" -and ($i + 1) -lt $n -and $content[$i + 1] -eq "/") {
            $in_comment = $false
            $i += 2
            $col_no++
            continue
        }
        $i++
        continue
    }
    if (-not $in_string) {
        if ($char -eq "/" -and ($i + 1) -lt $n -and $content[$i + 1] -eq "/") {
            $in_line_comment = $true
            $i += 2
            $col_no++
            continue
        }
        if ($char -eq "/" -and ($i + 1) -lt $n -and $content[$i + 1] -eq "*") {
            $in_comment = $true
            $i += 2
            $col_no++
            continue
        }
    }
    if ($in_string) {
        if ($char -eq "\") {
            $i += 2
            $col_no++
            continue
        }
        if ($char -eq $string_char) {
            $in_string = $false
        }
        $i++
        continue
    } else {
        if ($char -eq "'" -or $char -eq '"' -or $char -eq '`') {
            $in_string = $true
            $string_char = $char
            $i++
            continue
        }
    }
    
    if ($char -eq '(' -or $char -eq '[' -or $char -eq '{') {
        $stack.Add([PSCustomObject]@{ Char = $char; Line = $line_no; Col = $col_no })
    } elseif ($char -eq ')' -or $char -eq ']' -or $char -eq '}') {
        if ($stack.Count -eq 0) {
            $errors.Add("Unexpected closing $char at line $line_no, col $col_no")
        } else {
            $top = $stack[$stack.Count - 1]
            $stack.RemoveAt($stack.Count - 1)
            if (($char -eq ')' -and $top.Char -ne '(') -or `
                ($char -eq ']' -and $top.Char -ne '[') -or `
                ($char -eq '}' -and $top.Char -ne '{')) {
                $errors.Add("Mismatched closing $char at line $line_no, col $col_no with $($top.Char) at line $($top.Line), col $($top.Col)")
            }
        }
    }
    $i++
}
while ($stack.Count -gt 0) {
    $top = $stack[$stack.Count - 1]
    $stack.RemoveAt($stack.Count - 1)
    $errors.Add("Unclosed open $($top.Char) at line $($top.Line), col $($top.Col)")
}
if ($errors.Count -gt 0) {
    Write-Host "Total syntax errors: $($errors.Count)"
    for ($e = 0; $e -lt [Math]::Min($errors.Count, 10); $e++) {
        Write-Host $errors[$e]
    }
} else {
    Write-Host "Syntactically balanced brackets and braces!"
}
