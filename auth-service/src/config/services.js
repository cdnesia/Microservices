// Daftar service yang scope-nya di-discover otomatis oleh auth-service, supaya
// mapping route -> scope tidak perlu ditulis ulang manual di sini setiap ada service baru.
// gatewayPrefix HARUS sama dengan PathPrefix router + stripPrefix di
// traefik/dynamic/routers.yml & middlewares.yml, karena itu yang menentukan path
// yang dilihat oleh /verify (X-Forwarded-Uri, sebelum prefix di-strip).
module.exports = [
  {
    name: 'service-ruangan',
    baseUrl: process.env.SERVICE_RUANGAN_URL || 'http://service-ruangan:5000',
    gatewayPrefix: '/api',
  },
  {
    name: 'service-pegawai',
    baseUrl: process.env.SERVICE_PEGAWAI_URL || 'http://service-pegawai:5000',
    gatewayPrefix: '/api',
  },
  {
    name: 'service-bipot',
    baseUrl: process.env.SERVICE_BIPOT_URL || 'http://service-bipot:5000',
    gatewayPrefix: '/api',
  },
  {
    name: 'service-jadwal',
    baseUrl: process.env.SERVICE_JADWAL_URL || 'http://service-jadwal:5000',
    gatewayPrefix: '/api',
  },
  {
    name: 'service-khs',
    baseUrl: process.env.SERVICE_KHS_URL || 'http://service-khs:5000',
    gatewayPrefix: '/api',
  },
  {
    name: 'service-tagihan',
    baseUrl: process.env.SERVICE_TAGIHAN_URL || 'http://service-tagihan:5000',
    gatewayPrefix: '/api',
  },
  {
    name: 'service-telegram',
    baseUrl: process.env.SERVICE_TELEGRAM_URL || 'http://service-telegram:5000',
    gatewayPrefix: '/api',
  },
];
