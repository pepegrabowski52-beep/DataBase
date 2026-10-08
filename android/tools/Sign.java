import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Signiert eine APK (Schema v2) mit einem PKCS12-Schlüssel und prüft sie danach. */
public class Sign {
    public static void main(String[] args) throws Exception {
        if (args.length != 4) {
            System.err.println("Aufruf: Sign <keystore.p12> <passwort> <eingabe.apk> <ausgabe.apk>");
            System.exit(2);
        }
        char[] pass = args[1].toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(args[0])) {
            ks.load(in, pass);
        }
        String alias = ks.aliases().nextElement();
        PrivateKey key = (PrivateKey) ks.getKey(alias, pass);
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

        ApkSigner.SignerConfig signer =
            new ApkSigner.SignerConfig.Builder("FUNDUS", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(signer))
            .setInputApk(new File(args[2]))
            .setOutputApk(new File(args[3]))
            .setMinSdkVersion(24)
            .setV1SigningEnabled(false) // ab Android 7 (minSdk 24) genügt v2
            .setV2SigningEnabled(true)
            .build()
            .sign();

        ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[3])).build().verify();
        System.out.println("verifiziert: " + result.isVerified()
            + " (v1: " + result.isVerifiedUsingV1Scheme() + ", v2: " + result.isVerifiedUsingV2Scheme() + ")");
        for (ApkVerifier.IssueWithParams e : result.getErrors()) System.out.println("Fehler: " + e);
        if (!result.isVerified()) System.exit(1);
    }
}
