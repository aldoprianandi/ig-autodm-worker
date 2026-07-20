#!/usr/bin/env node
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(process.cwd(), "src/admin/ui.ts");
const backup = `${target}.bak`;

let source = await readFile(target, "utf8");
await copyFile(target, backup);

const replacements = [
  ['lang="id"', 'lang="fr"'],
  ["IG AutoDM Worker", "Ki’Savan AutoDM"],
  ["Verifikasi keamanan tambahan dari Cloudflare.", "Vérification de sécurité supplémentaire assurée par Cloudflare."],
  ["Dashboard internal", "Tableau de bord interne"],
  ["Mengecek akses…", "Vérification de l’accès…"],
  ["Kalau login masih aktif, dashboard akan terbuka otomatis.", "Si votre session est toujours active, le tableau de bord s’ouvrira automatiquement."],
  ["Kelola campaign Auto-DM Instagram dari satu tempat yang aman dan rapi.", "Gérez vos campagnes de messages automatiques Instagram depuis un espace sécurisé et organisé."],
  ["Privat", "Accès privé"],
  ["akses hanya untuk operator", "réservé à l’administrateur"],
  ["2 tahap", "2 niveaux"],
  ["login operator + security key", "identifiants + clé de sécurité"],
  ["30 menit", "30 minutes"],
  ["terkunci otomatis saat tidak dipakai", "verrouillage automatique en cas d’inactivité"],
  ["Login dashboard", "Connexion"],
  ["Masuk ke dashboard", "Se connecter au tableau de bord"],
  ["Gunakan akun operator, lalu verifikasi dengan security key.", "Utilisez vos identifiants administrateur, puis confirmez avec la clé de sécurité."],
  ["Username", "Identifiant"],
  ["Akun operator yang terdaftar.", "Identifiant administrateur enregistré."],
  ["Password", "Mot de passe"],
  ["Password akun operator.", "Mot de passe administrateur."],
  ["Security key", "Clé de sécurité"],
  ["Kode akses tambahan untuk membuka dashboard.", "Clé d’accès supplémentaire au tableau de bord."],
  [">Masuk<", ">Se connecter<"],
  ["Terhubung", "Connecté"],
  ["Muat ulang", "Actualiser"],
  ["Kunci dashboard", "Verrouiller"],
  ["Campaign Auto-DM", "Campagnes Auto-DM"],
  ["Pilih campaign atau buat baru. Campaign aktif akan merespons komentar sesuai kata pemicu.", "Sélectionnez une campagne ou créez-en une. Une campagne active répond aux commentaires contenant le mot-clé défini."],
  ["Campaign", "Campagnes"],
  ["Terkirim", "Envoyés"],
  ["Gagal", "Échecs"],
  ["Dicoba ulang", "Nouvelles tentatives"],
  ["Status: memeriksa", "Statut : vérification"],
  ["Campaign aktif:", "Campagnes actives :"],
  ["Koneksi Instagram:", "Connexion Instagram :"],
  ["Error: tidak ada", "Erreur : aucune"],
  ["Buat campaign baru", "Créer une campagne"],
  ["Pilih post, isi pemicu, cek preview, simpan draft, lalu aktifkan.", "Choisissez une publication, définissez le mot-clé, vérifiez l’aperçu, enregistrez le brouillon puis activez la campagne."],
  ["1. Pilih post", "1. Choisir la publication"],
  ["2. Isi pemicu", "2. Définir le mot-clé"],
  ["3. Isi alur DM", "3. Configurer les messages"],
  ["4. Simpan, lalu aktifkan", "4. Enregistrer puis activer"],
  ["Mulai dari pilih post", "Commencer par choisir une publication"],
  ["Daftar campaign", "Liste des campagnes"],
  ["Setiap campaign mengawasi satu post, satu kata pemicu, dan satu alur DM.", "Chaque campagne surveille une publication, un mot-clé et un parcours de messages."],
  ["Belum ada campaign dimuat.", "Aucune campagne chargée."],
  ["Editor campaign", "Éditeur de campagne"],
  ["Pilih campaign atau buat baru.", "Sélectionnez une campagne ou créez-en une."],
  ["Simpan Draft", "Enregistrer le brouillon"],
  ["Aktifkan campaign", "Activer la campagne"],
  ["Jeda campaign", "Mettre en pause"],
  ["Hapus campaign", "Supprimer la campagne"],
  ["Pilih campaign", "Sélectionner une campagne"],
  ["Pilih campaign yang sudah ada, atau buat campaign baru.", "Sélectionnez une campagne existante ou créez-en une nouvelle."],
  ["Lengkapi bagian wajib: post, kata pemicu, DM pertama, tombol, dan prompt/link akhir. Variasi bisa ditambahkan nanti.", "Complétez les éléments obligatoires : publication, mot-clé, premier message, bouton et message ou lien final. Les variantes pourront être ajoutées ensuite."],
  ["Pilih post Instagram", "Choisir la publication Instagram"],
  ["Campaign hanya berjalan di post ini, bukan semua post Instagram.", "La campagne s’applique uniquement à cette publication."],
  ["Post yang dipantau", "Publication surveillée"],
  ["Belum ada post dipilih", "Aucune publication sélectionnée"],
  ["Pilih post", "Choisir une publication"],
  ["Post terbaru", "Publications récentes"],
  ["Pilih satu post yang akan dipantau oleh campaign ini.", "Choisissez la publication que cette campagne doit surveiller."],
  ["Buka daftar post atau klik Muat ulang post.", "Ouvrez la liste ou actualisez les publications."],
  ["Muat ulang post", "Actualiser les publications"],
  ["Komentar pemicu", "Commentaire déclencheur"],
  ["Jika komentar mengandung kata/frasa ini, alur DM akan dimulai. Huruf besar/kecil, typo kecil, kata utama pada frasa, dan urutan kata ikut ditoleransi.", "Lorsqu’un commentaire contient ce mot ou cette expression, le parcours de messages démarre. La détection tolère la casse et de petites fautes de frappe."],
  ["Nama campaign", "Nom de la campagne"],
  ["Nama ini hanya muncul di dashboard.", "Ce nom apparaît uniquement dans le tableau de bord."],
  ["Kata/frasa pemicu", "Mot ou expression déclencheur"],
  ["Cukup isi pemicu utama. Variasi typo ringan akan dideteksi otomatis.", "Saisissez le mot-clé principal. Les petites fautes seront détectées automatiquement."],
  ["Alur DM", "Parcours de messages"],
  ["Ini yang user lihat di inbox: DM pertama, tombol, lalu prompt/link akhir.", "Voici ce que la personne recevra : un premier message, un bouton, puis le message ou le lien final."],
  ["DM pertama", "Premier message privé"],
  ["Pesan pertama setelah user komentar dengan kata pemicu.", "Message envoyé après le commentaire contenant le mot-clé."],
  ["Tombol di DM pertama", "Bouton du premier message"],
  ["Tombol ini membawa user ke prompt/link akhir. Maksimal 20 karakter.", "Ce bouton mène au message ou au lien final. 20 caractères maximum."],
  ["Wajib follow sebelum prompt akhir", "Exiger un abonnement avant le message final"],
  ["Opsional", "Facultatif"],
  ["Cari", "Rechercher"],
  ["Belum ada template.", "Aucun modèle disponible."],
  ["Tambah langkah", "Ajouter une étape"],
  ["Prompt/link akhir", "Message ou lien final"],
  ["Balasan komentar publik", "Réponse publique au commentaire"],
  ["Muncul sebagai reply di komentar setelah DM pertama terkirim. Kosongkan kalau tidak mau balasan publik.", "Cette réponse apparaît sous le commentaire après l’envoi du premier message. Laissez vide pour ne pas répondre publiquement."],
  ["Balasan publik utama", "Réponse publique principale"],
  ["Simpan sebagai draft dulu. Aktifkan setelah isi campaign dicek.", "Enregistrez d’abord comme brouillon, puis activez après vérification."],
  ["Pengaturan lanjutan", "Paramètres avancés"],
  ["Ringkasan", "Résumé"],
  ["Belum ada campaign yang dipilih.", "Aucune campagne sélectionnée."],
  ["Buang perubahan", "Annuler les modifications"],
  ["Reset form", "Réinitialiser"],
  ["Simpan campaign", "Enregistrer la campagne"],
  ["Checklist sebelum aktif", "Vérifications avant activation"],
  ["Belum dipilih", "Non sélectionnée"],
  ["Pemicu", "Mot-clé"],
  ["Belum diisi", "Non renseigné"],
  ["Belum lengkap", "Incomplet"],
  ["Mati", "Désactivé"],
  ["Di komentar post", "Dans les commentaires"],
  ["Simulasi setelah user komentar dengan kata pemicu.", "Simulation après un commentaire contenant le mot-clé."],
  ["Di DM user", "Dans les messages privés"],
  ["Simulasi alur yang diterima user di inbox.", "Simulation du parcours reçu dans la messagerie."],
  ["KIRIM PROMPT", "AFFICHER LA SUITE"],
  ["Status sistem online", "Système opérationnel"],
  ["Kondisi sistem", "État du système"],
  ["Koneksi Instagram", "Connexion Instagram"],
  ["Kadaluarsa", "Expiration"],
  ["Error terakhir", "Dernière erreur"],
  ["Limit kirim", "Limite d’envoi"],
  ["Limit pemantauan post", "Limite de surveillance"],
  ["Campaign dipilih kosong", "Aucune campagne sélectionnée"],
  ["Balasan publik", "Réponse publique"],
];

let applied = 0;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    applied++;
  }
}

if (applied < 45) {
  throw new Error(
    `Seulement ${applied} remplacements appliqués. Le fichier ui.ts a peut-être changé ; restauration disponible dans ${backup}.`
  );
}

source = source.replace(
  /<input([^>]+)name="username"([^>]*)>/g,
  '<input$1name="username"$2 autocomplete="username">'
);
source = source.replace(
  /<input([^>]+)name="password"([^>]*)>/g,
  '<input$1name="password"$2 autocomplete="current-password">'
);
source = source.replace(
  /<input([^>]+)name="adminToken"([^>]*)>/g,
  '<input$1name="adminToken"$2 autocomplete="off" autocapitalize="none" spellcheck="false">'
);

await writeFile(target, source, "utf8");
console.log(`✅ Interface Ki’Savan traduite en français (${applied} remplacements).`);
console.log(`📦 Sauvegarde créée : ${backup}`);
