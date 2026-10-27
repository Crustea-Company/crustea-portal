# Crustea Portal - image produksi.
#
# PENTING: dua variabel NEXT_PUBLIC_* ditanam ke kode browser SAAT BUILD.
# Memberinya hanya saat `docker run -e ...` TIDAK cukup: login akan macet di "Mengirim...".
#
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<proyek>.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
#     -t crustea-portal .
#   docker run -d -p 3000:3000 \
#     -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
#     -e SESSION_SECRET=<acak, min. 32 karakter> \
#     crustea-portal
#
# Kedua nilai NEXT_PUBLIC_* itu kunci publik (aman di browser, dibatasi RLS). SUPABASE_SECRET_KEY tidak dibutuhkan.
# SESSION_SECRET RAHASIA dan hanya dibaca saat berjalan (jangan jadikan build-arg). Buat sekali:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# Mengganti nilainya = semua pengguna harus login ulang.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1
# Gagal lebih awal kalau build-arg lupa diisi.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    || (echo "ERROR: --build-arg NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY wajib diisi" && exit 1)
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
