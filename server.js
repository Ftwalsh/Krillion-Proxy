const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();
app.set('trust proxy', true);

const TARGET = 'https://krillion.io';
const TARGET_HOST = 'krillion.io';

const proxy = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  ws: false, // Handled explicitly via server.on('upgrade') below
  selfHandleResponse: true,
  cookieDomainRewrite: '', // Keeps game progress/streak cookies on your proxy domain
  on: {
    proxyReq: (proxyReq) => {
      // Spoof Origin and Referer so API and CORS checks pass
      proxyReq.setHeader('Origin', TARGET);
      proxyReq.setHeader('Referer', `${TARGET}/`);
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      // Strip framing/CSP headers that could block assets on a custom domain
      res.removeHeader('content-security-policy');
      res.removeHeader('x-frame-options');

      const proxyOrigin = `${req.protocol}://${req.get('host')}`;

      // Rewrite any 301/302 redirects pointing to krillion.io
      const location = res.getHeader('location');
      if (typeof location === 'string' && location.includes(TARGET_HOST)) {
        res.setHeader(
          'location',
          location.replace(new RegExp(`https?://${TARGET_HOST}`, 'g'), proxyOrigin)
        );
      }

      // Rewrite hardcoded URLs inside HTML, JS, CSS, and JSON responses
      const contentType = proxyRes.headers['content-type'] || '';
      const isText =
        contentType.includes('text/') ||
        contentType.includes('application/javascript') ||
        contentType.includes('application/json');

      if (isText) {
        const body = responseBuffer.toString('utf8');
        return body.replace(new RegExp(`https?://${TARGET_HOST}`, 'g'), proxyOrigin);
      }

      // Return binary files (images, fonts, audio, wasm) unmodified
      return responseBuffer;
    }),
  },
});

app.use('/', proxy);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Proxy active at http://localhost:${PORT}`);
});

// Forward WebSocket connections for multiplayer rooms
server.on('upgrade', proxy.upgrade);
