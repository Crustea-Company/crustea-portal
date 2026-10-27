# Crustea Portal - image produksi (versi dari Vio, TechOps).
#
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<proyek>.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
#     -t crustea-portal .
#   docker run -d -p 3001:3001 -e SESSION_SECRET=<acak, min. 32 karakter> crustea-portal
#
# SESSION_SECRET rahasia dan hanya dibaca saat berjalan (jangan jadikan build-arg). Lihat docs/HANDOVER-VIO.md 3a.

# ==========================================
# 1. Base image
# ==========================================
FROM node:22-alpine

# ==========================================
# 2. Direktori kerja
# ==========================================
WORKDIR /app

# ==========================================
# 3. Build arguments untuk Supabase
# ==========================================
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# Tersedia selama build Next.js
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

# ==========================================
# 4. Install dependencies
# ==========================================
COPY package*.json ./
RUN npm ci

# ==========================================
# 5. Copy source code
# ==========================================
COPY . .

# ==========================================
# 6. Validasi konfigurasi Supabase
# ==========================================
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
    && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

# ==========================================
# 7. Build Next.js
# ==========================================
RUN npm run build

# ==========================================
# 8. Port aplikasi
# ==========================================
EXPOSE 3001

# ==========================================
# 9. Jalankan aplikasi
# ==========================================
CMD ["npm", "run", "start", "--", "-p", "3001"]
