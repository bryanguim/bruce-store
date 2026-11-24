package com.bruce.tv;

import android.content.Context;
import android.graphics.BitmapFactory;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Locale;

/**
 * Mini serveur local, actif seulement quand l'écran « Envoyer une photo » est ouvert.
 * - écoute uniquement sur l'adresse Wi-Fi de la clé (jamais Internet)
 * - chaque ouverture crée un code secret aléatoire (dans le QR code) : sans lui, tout est refusé
 * - accepte UNE seule photo (25 Mo max), vérifie que c'est bien une image, puis s'arrête
 * - s'arrête tout seul au bout de 5 minutes ou après trop d'essais refusés
 */
public class PhotoReceiver {
    public interface Listener { void onPhoto(String wallValue); void onStopped(); }

    public static final String FILE = "wall_phone.jpg";
    private static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final long LIFETIME_MS = 5 * 60 * 1000;

    private final Context ctx;
    private final Listener listener;
    public final String token;
    private final String nonce;
    private volatile boolean running;
    private ServerSocket server;
    public String url;

    public PhotoReceiver(Context ctx, Listener l) {
        this.ctx = ctx.getApplicationContext();
        this.listener = l;
        this.token = rand(24);
        this.nonce = rand(16);
    }

    private static String rand(int n) {
        final String a = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(a.charAt(r.nextInt(a.length())));
        return sb.toString();
    }

    /** démarre ; renvoie false s'il n'y a pas de réseau local */
    public boolean start() {
        InetAddress ip = localIp();
        if (ip == null) return false;
        try {
            server = new ServerSocket(0, 4, ip);
            server.setSoTimeout(1000);
        } catch (Exception e) { return false; }
        url = "http://" + ip.getHostAddress() + ":" + server.getLocalPort() + "/?k=" + token;
        running = true;
        final long deadline = System.currentTimeMillis() + LIFETIME_MS;
        Thread t = new Thread(() -> {
            int refused = 0;
            while (running && System.currentTimeMillis() < deadline && refused < 20) {
                try (Socket s = server.accept()) {
                    s.setSoTimeout(20000);
                    int r = handle(s);
                    if (r < 0) refused++;
                    if (r == 2) { running = false; }
                } catch (SocketTimeoutException ignored) {
                } catch (Exception e) { if (!running) break; }
            }
            stop();
            listener.onStopped();
        }, "photo-receiver");
        t.setDaemon(true);
        t.start();
        return true;
    }

    public void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) {}
    }

    public boolean isRunning() { return running; }

    private static InetAddress localIp() {
        InetAddress best = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase(Locale.ROOT);
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    if (name.startsWith("wlan") || name.startsWith("eth")) return a;
                    if (best == null) best = a;
                }
            }
        } catch (Exception ignored) {}
        return best;
    }

    /** -1 refusé · 0 page servie · 2 photo reçue */
    private int handle(Socket s) throws Exception {
        InputStream in = s.getInputStream();
        OutputStream out = s.getOutputStream();
        String head = readHead(in);
        if (head == null) return -1;
        String[] lines = head.split("\r\n");
        String[] rl = lines[0].split(" ");
        if (rl.length < 2) { send(out, 400, "text/plain", "x".getBytes()); return -1; }
        String method = rl[0], target = rl[1];
        long len = -1;
        for (int i = 1; i < lines.length; i++) {
            int c = lines[i].indexOf(':');
            if (c > 0 && lines[i].substring(0, c).trim().equalsIgnoreCase("content-length")) {
                try { len = Long.parseLong(lines[i].substring(c + 1).trim()); } catch (Exception ignored) {}
            }
        }
        String path = target, query = "";
        int q = target.indexOf('?');
        if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
        String k = "";
        for (String p : query.split("&")) if (p.startsWith("k=")) k = p.substring(2);
        if (!MessageDigest.isEqual(k.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) {
            send(out, 403, "text/plain; charset=utf-8", "Code expiré : rescanne le QR code sur la télé.".getBytes(StandardCharsets.UTF_8));
            return -1;
        }
        if (method.equals("GET") && path.equals("/")) {
            send(out, 200, "text/html; charset=utf-8", page().getBytes(StandardCharsets.UTF_8));
            return 0;
        }
        if (method.equals("POST") && path.equals("/up")) {
            if (len <= 0 || len > MAX_BYTES) { send(out, 413, "text/plain", "trop gros".getBytes()); return -1; }
            File tmp = new File(ctx.getCacheDir(), "incoming.tmp");
            long got = 0;
            try (OutputStream fo = new BufferedOutputStream(new FileOutputStream(tmp))) {
                byte[] buf = new byte[64 * 1024];
                while (got < len) {
                    int n = in.read(buf, 0, (int) Math.min(buf.length, len - got));
                    if (n < 0) break;
                    fo.write(buf, 0, n);
                    got += n;
                }
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(tmp.getAbsolutePath(), o);
            if (got != len || o.outWidth <= 0 || o.outHeight <= 0 || o.outWidth > 16000 || o.outHeight > 16000) {
                tmp.delete();
                send(out, 415, "text/plain", "pas une image".getBytes());
                return -1;
            }
            File dst = new File(ctx.getFilesDir(), FILE);
            dst.delete();
            if (!tmp.renameTo(dst)) { tmp.delete(); send(out, 500, "text/plain", "erreur".getBytes()); return -1; }
            send(out, 200, "text/plain", "ok".getBytes());
            listener.onPhoto("app:" + FILE + "#" + System.currentTimeMillis());
            return 2;
        }
        send(out, 404, "text/plain", "x".getBytes());
        return -1;
    }

    private static String readHead(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int state = 0;
        while (b.size() < 8192) {
            int c = in.read();
            if (c < 0) return null;
            b.write(c);
            if (c == '\r' && (state == 0 || state == 2)) state++;
            else if (c == '\n' && (state == 1 || state == 3)) { state++; if (state == 4) return b.toString("ISO-8859-1"); }
            else state = 0;
        }
        return null;
    }

    private void send(OutputStream out, int code, String type, byte[] body) throws Exception {
        String h = "HTTP/1.1 " + code + " X\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY"
                + "\r\nContent-Security-Policy: default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce
                + "'; img-src blob:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"
                + "\r\nConnection: close\r\n\r\n";
        out.write(h.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }

    private String page() {
        return "<!doctype html><html lang=fr><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<title>Bruce TV · Photo</title><style nonce=" + nonce + ">"
            + "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#2a2a2e,#000 70%);color:#fff;font:16px -apple-system,system-ui,sans-serif}"
            + ".c{width:min(92vw,420px);padding:30px 24px;border-radius:30px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);text-align:center}"
            + "h1{font-size:24px;margin:0 0 6px}p{opacity:.75;margin:0 0 22px;line-height:1.4}"
            + "label{display:block;padding:16px;border-radius:99px;background:#fff;color:#000;font-weight:700;font-size:17px}"
            + "input{display:none}#s{margin-top:18px;min-height:22px;font-weight:600}img{max-width:100%;border-radius:16px;margin-top:16px;display:none}"
            + "</style></head><body><div class=c><h1>Bruce TV</h1><p>Choisis la photo à mettre en fond d'écran sur le projecteur.</p>"
            + "<label for=f>Choisir une photo</label><input id=f type=file accept='image/*'><img id=v alt=''><div id=s></div></div>"
            + "<script nonce=" + nonce + ">"
            + "var f=document.getElementById('f'),s=document.getElementById('s'),v=document.getElementById('v');"
            + "f.onchange=function(){var x=f.files[0];if(!x)return;s.textContent='Préparation…';var u=URL.createObjectURL(x),i=new Image();"
            + "i.onload=function(){var m=2560,w=i.naturalWidth,h=i.naturalHeight,r=Math.min(1,m/Math.max(w,h));var c=document.createElement('canvas');c.width=Math.round(w*r);c.height=Math.round(h*r);"
            + "c.getContext('2d').drawImage(i,0,0,c.width,c.height);v.src=u;v.style.display='block';"
            + "c.toBlob(function(b){s.textContent='Envoi vers la télé…';fetch('/up?k=" + token + "',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:b})"
            + ".then(function(r){s.textContent=r.ok?'✓ C\\'est sur la télé !':'Erreur : rescanne le QR code.'}).catch(function(){s.textContent='Erreur : vérifie que tu es sur le même Wi-Fi.'})},'image/jpeg',0.9)};"
            + "i.onerror=function(){s.textContent='Cette photo ne peut pas être lue.'};i.src=u};"
            + "</script></body></html>";
    }
}
