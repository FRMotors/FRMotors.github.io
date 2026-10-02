# FR Motors

Sistema web da FR Motors para Ficha / O.S. e Orçamentos.

## GitHub Pages

Publicação preparada para `https://nicolesanches.github.io/FRMotors/`.

No GitHub, configure **Settings → Pages → Deploy from a branch → main → /(root)**.

No Supabase, mantenha a URL do Netlify e adicione também em **Authentication → URL Configuration → Redirect URLs**:

`https://nicolesanches.github.io/FRMotors/**`

O frontend usa somente a chave publicável do Supabase. Nunca publique uma chave `service_role`.
