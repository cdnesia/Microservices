// Daftar service yang scope-nya di-discover otomatis oleh service-auth, supaya
// mapping route -> scope tidak perlu ditulis ulang manual di sini setiap ada service baru.
// gatewayPrefix HARUS sama dengan PathPrefix router + stripPrefix di
// traefik/dynamic/routers.yml & middlewares.yml, karena itu yang menentukan path
// yang dilihat oleh /verify (X-Forwarded-Uri, sebelum prefix di-strip).
module.exports = [
  {
    name: 'service-ruangan',
    baseUrl: process.env.SERVICE_RUANGAN_URL || 'http://service-ruangan:5000',
    gatewayPrefix: '/api/v1',
  },
  {
    name: 'service-pegawai',
    baseUrl: process.env.SERVICE_PEGAWAI_URL || 'http://service-pegawai:5000',
    gatewayPrefix: '/api/v1',
  },
  {
    name: 'service-bipot',
    baseUrl: process.env.SERVICE_BIPOT_URL || 'http://service-bipot:5000',
    gatewayPrefix: '/api/v1',
  },
  {
    name: 'service-jadwal',
    baseUrl: process.env.SERVICE_JADWAL_URL || 'http://service-jadwal:5000',
    gatewayPrefix: '/api/v1',
  },
  {
    name: 'service-khs',
    baseUrl: process.env.SERVICE_KHS_URL || 'http://service-khs:5000',
    gatewayPrefix: '/api/v1',
  },
  {
    name: 'service-tagihan',
    baseUrl: process.env.SERVICE_TAGIHAN_URL || 'http://service-tagihan:5000',
    gatewayPrefix: '/api/v1',
  },
  {
    name: 'service-telegram',
    baseUrl: process.env.SERVICE_TELEGRAM_URL || 'http://service-telegram:5000',
    gatewayPrefix: '/api/v1',
  },
  // service-simawa SENGAJA TIDAK didaftarkan di sini — router-nya (traefik/dynamic/routers.yml)
  // tidak lagi lewat auth-scope/forwardAuth (lihat simawa-chain di middlewares.yml: React SPA
  // publik, tidak ada model client_credentials untuk service ini). Kalau tetap didaftarkan,
  // discoverScopes() bakal terus upsert scope simawa:* ke tabel `scopes` dan memunculkannya di
  // checklist manage-client.sh seolah-olah bisa di-grant/di-enforce ke client — padahal
  // resolveRequiredScope() untuk path /api/v1/simawa/* itu tidak pernah dipanggil sama sekali
  // (tidak ada forwardAuth ke /verify di depan service ini), jadi scope itu cuma pajangan yang
  // menyesatkan operator.
];
