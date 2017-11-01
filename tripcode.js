/*
2017/11/02 FreeBSD 0x80バグ再現を削除
2017/07/31 変換処理を整理
2017/07/29 インデント調整(タブ文字→半角スペース)
2017/07/28 クロージャ周りを整理
2017/07/11 ES2015
2016/08/18 無駄な処理を削減
2016/02/20 Unicode文字および絵文字に対応
2014/05/05 公開

以下のライブラリを使用しています。
ecl.js  : http://www.junoe.jp/downloads/itoh/enc_js.shtml
des.js  : http://user1.matsumoto.ne.jp/~goma/js/des.html
sha1.js : http://user1.matsumoto.ne.jp/~goma/js/hash.html
*/

(() => {
    if (String.prototype.tripcode) return;

    /** Shift_JISエスケープされた中黒 */
    const interpunct = EscapeSJIS("・");

    /** Shift_JISに変換できないUnicodeを文字参照に変換 */
    const toShiftJIS = char => char.length > 1 || char !== "・" && EscapeSJIS(char) === interpunct ? `&#${char.codePointAt(0)};` : char;

    /** Shift_JISエスケープされた文字のパターン */
    const shiftJISPercentEncodingPattern = /%([A-Z0-9]{2})/g;

    /** ダイジェストをバイナリ文字に変換 */
    const toBinary = (substring, arg1) => String.fromCodePoint(parseInt(arg1, 16));

    /** 10桁トリップ生キーのパターン */
    const rawKeyPattern = /^#([0-9A-Fa-f]{16})([.\/0-9A-Za-z]{0,2})$/;

    /** 末尾ピリオドのパターン */
    const tailPeriodsPattern = /\.+$/;

    /** ダイジェストを生キーに変換 */
    const rawKey = (digest, salt) => "##" + digest.toUpperCase() + salt.replace(tailPeriodsPattern, "");

    /** Shift_JIS半角カナのバイトパターン */
    const halfWidthKanaPattern = /^[$][\xA1-\xDF]/;

    /** バイナリ文字をダイジェストに変換 */
    const toDigest = char => char.codePointAt(0).toString(16);

    /** バイナリ文字をsaltに変換 */
    const toSalt = char => {
        const codePoint = char.codePointAt(0);
        if (codePoint < 0x2E || 0x7A < codePoint) {
            return ".";
        } else if (0x3A <= codePoint && codePoint <= 0x40) {
            return String.fromCodePoint(codePoint + 0x07);
        } else if (0x5B <= codePoint && codePoint <= 0x60) {
            return String.fromCodePoint(codePoint + 0x06);
        }
        return char;
    };

    /** 10桁トリップ変換 */
    const crypt = (key, salt) => des.crypt(key.split("\x00")[0], salt).substr(-10);

    /**
     * 英数字を半角カナに変換(15桁トリップ用)
     */
    const toHalfWidthKana = char => {
        const codePoint = char.codePointAt(0);
        if (0x30 <= codePoint && codePoint <= 0x39) {
            return String.fromCodePoint(codePoint + 0x71);
        } else if (0x41 <= codePoint && codePoint <= 0x5A) {
            return String.fromCodePoint(codePoint + 0x6A);
        } else if (0x61 <= codePoint && codePoint <= 0x7A) {
            return String.fromCodePoint(codePoint + 0x64);
        }
        return char === "." ? String.fromCodePoint(0xDF) : char;
    };

    /**
     * 10桁トリップ生成
     */
    const tripcodeWithKey = (key, appendRawKey) => {
        // saltを準備
        let salt = "H.";
        if (key.length > 0) {
            salt = [...`${key}${salt}`.substr(1, 2)].map(toSalt).join("");
        }

        // 変換
        const tripcode = crypt(key, salt);

        // 生キー付加
        if (appendRawKey) {
            const digest = [...key]
                .map(toDigest)
                .concat(new Array(16).fill("0"))
                .join("")
                .substr(0, 16);
            return tripcode + " " + rawKey(digest, salt);
        }

        return tripcode;
    };

    /**
     * 10桁トリップ生成(生キー)
     */
    const tripcodeWithRawKey = (key, append) => {
        if (key[0] !== "#") return null;

        const result = key.match(rawKeyPattern);
        if (!result) return "???";

        const digest = result[1];
        const salt = (result[2] + "..").substr(0, 2);

        // キーをバイナリ文字列に変換
        key = new Array(8)
            .fill()
            .map((v, i) => "%" + digest.substr(i * 2, 2))
            .join("");
        key = unescape(key);

        // 変換
        const tripcode = crypt(key, salt);

        // 生キー付加
        return append
            ? tripcode + " " + rawKey(digest, salt)
            : tripcode;
    };

    /**
     * 15桁トリップ生成
     */
    const tripcode15WithKey = (key) => {
        if (key[0] !== "$") return null;

        const tripcode = btoa(sha1.bin(key))
            .substr(3, 15)
            .replace("+", ".")
            .replace("/", "!");

        // キー2文字目が半角カナの場合はトリップを半角カナに置換
        return key.match(halfWidthKanaPattern)
            ? UnescapeSJIS(escape([...tripcode].map(toHalfWidthKana).join("")))
            : tripcode;
    };

    /**
     * 12桁トリップ生成
     */
    const tripcode12WithKey = (key) => {
        return btoa(sha1.bin(key))
            .substr(0, 12)
            .replace("+", ".");
    };

    /**
     * Unicode文字を10進数の数値文字参照に変換
     */
    String.prototype.shiftJIS = function () {
        return [...this].map(toShiftJIS).join("");
    };

    /**
     * 文字列をトリップに変換
     */
    String.prototype.tripcode = function (appendRawKey) {
        // 生キー生成オプションをboolean型に変換
        appendRawKey = !!appendRawKey;

        // 改行コードがあれば除去
        let key = this.replace(/\r|\n/g, "")

        // Unicode文字を10進数の数値文字参照に変換
        key = key.shiftJIS();

        // Shift_JISバイナリデータに変換
        key = EscapeSJIS(key).replace(shiftJISPercentEncodingPattern, toBinary);

        // 変換
        return key.length < 12
            ? tripcodeWithKey(key, appendRawKey)
            : tripcodeWithRawKey(key, appendRawKey)
            || tripcode15WithKey(key)
            || tripcode12WithKey(key);
    };
})();
