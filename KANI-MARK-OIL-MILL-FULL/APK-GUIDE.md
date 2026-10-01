# Turn KANI MARK into an Android APK

The app is your website inside an Android shell, so the Node server must be ONLINE first (orders and payments run on the server).

1. Deploy this project to a host with HTTPS and a persistent disk (e.g. Render, Railway, or a VPS). Put your Razorpay keys in the host's environment settings.
2. Open the site on your phone in Chrome. You should be able to "Install app / Add to Home screen" (this is the PWA, already included).
3. Go to https://www.pwabuilder.com, enter your site URL, click Start, then "Package for stores" → Android.
4. Fill in package ID (e.g. com.kanimark.oilmill), app name "KANI MARK OIL MILL", then Generate. Download the zip.
5. Inside it you get an `.apk` (to install/test directly) and an `.aab` (for Google Play), plus a signing key file. KEEP THE KEY SAFE - you need the same key for every future update.
6. Copy the .apk to your phone, allow "install unknown apps", install, and test a payment.
7. For Google Play: create a Play Console account (one-time US$25 fee) and upload the .aab.
