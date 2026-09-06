import pathlib

p = pathlib.Path("frontend/src/client/types.gen.ts")
t = p.read_text(encoding="utf-8-sig")

old = "forma_pagamento: 'cartao_debito' | 'cartao_credito' | 'pix' | 'dinheiro' | 'vale';"
new = "forma_pagamento: 'cartao_debito' | 'cartao_credito' | 'pix' | 'dinheiro' | 'vale' | 'vale_gas';"

if old in t:
    p.write_text(t.replace(old, new), encoding="utf-8")
    print("OK")
else:
    print("nao encontrado")
