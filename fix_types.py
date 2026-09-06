import pathlib

p = pathlib.Path("frontend/src/client/types.gen.ts")
t = p.read_text(encoding="utf-8-sig")

# Adiciona vale_gas_numero e vale_gas_bloco_id em VendaCreate
old = "    vale_numero?: (number | null);\n    data_pagamento_vale?: (string | null);\n    valor_pago: (number | string);"
new = "    vale_numero?: (number | null);\n    data_pagamento_vale?: (string | null);\n    vale_gas_numero?: (number | null);\n    vale_gas_bloco_id?: (string | null);\n    valor_pago: (number | string);"

if old in t:
    t = t.replace(old, new)
    p.write_text(t, encoding="utf-8")
    print("OK")
else:
    # mostra contexto para debug
    idx = t.find("vale_numero")
    print("Nao encontrado. Contexto:")
    print(repr(t[idx:idx+200]))
