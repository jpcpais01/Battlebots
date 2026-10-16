#!/usr/bin/env python3
"""
Minimal stand-in for Android's `apksigner`, for containers without the Android SDK.

Godot's Android export calls `apksigner sign --ks KS --ks-pass pass:PW --ks-key-alias A [--key-pass pass:PW] APK`
and then `apksigner verify APK`. This signs with APK Signature Scheme v2 (RSA PKCS#1 v1.5 + SHA-256),
which every Android version Godot 4 supports (API 24+) accepts, and verifies v2 signatures it finds.

The APK is expected to be zip-aligned already (Godot aligns before signing). The v2 block goes between
the entries and the central directory, so entry offsets (and their alignment) do not move.
"""
import hashlib
import os
import struct
import subprocess
import sys
import tempfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs12

V2_ID = 0x7109871A
SIG_RSA_PKCS1_SHA256 = 0x0103
MAGIC = b'APK Sig Block 42'
CHUNK = 1 << 20


def lp(b: bytes) -> bytes:
    return struct.pack('<I', len(b)) + b


def find_eocd(data: bytes) -> int:
    # EOCD is 22 bytes plus a comment of up to 65535 bytes.
    start = max(0, len(data) - 22 - 0xFFFF)
    i = data.rfind(b'PK\x05\x06', start)
    while i >= 0:
        comment_len = struct.unpack_from('<H', data, i + 20)[0]
        if i + 22 + comment_len == len(data):
            return i
        i = data.rfind(b'PK\x05\x06', start, i)
    raise SystemExit('apksigner: no end of central directory record')


def split(data: bytes):
    """Returns (entries, central_dir, eocd, cd_offset, signing_block_or_None)."""
    eocd_off = find_eocd(data)
    cd_size, cd_off = struct.unpack_from('<II', data, eocd_off + 12)
    if cd_off + cd_size != eocd_off:
        raise SystemExit('apksigner: central directory is not directly before the EOCD (zip64 or junk)')
    block = None
    entries_end = cd_off
    if cd_off >= 32 and data[cd_off - 16:cd_off] == MAGIC:
        size = struct.unpack_from('<Q', data, cd_off - 24)[0]
        bstart = cd_off - size - 8
        block = data[bstart:cd_off]
        entries_end = bstart
    return data[:entries_end], data[cd_off:eocd_off], data[eocd_off:], entries_end, block


def chunk_digest(sections) -> bytes:
    digests = []
    for sec in sections:
        for o in range(0, len(sec), CHUNK):
            part = sec[o:o + CHUNK]
            digests.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(part)) + part).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(digests)) + b''.join(digests)).digest()


def eocd_with_cd_offset(eocd: bytes, off: int) -> bytes:
    return eocd[:16] + struct.pack('<I', off) + eocd[20:]


def load_key(ks: str, ks_pass: str, alias: str, key_pass: str):
    raw = open(ks, 'rb').read()
    try:
        key, cert, _ = pkcs12.load_key_and_certificates(raw, ks_pass.encode())
    except Exception:
        # A JKS keystore: let keytool convert it to PKCS#12 first.
        with tempfile.TemporaryDirectory() as td:
            p12 = os.path.join(td, 'k.p12')
            subprocess.run(['keytool', '-importkeystore', '-noprompt', '-srckeystore', ks, '-srcstorepass', ks_pass,
                            '-srcalias', alias, '-srckeypass', key_pass, '-destkeystore', p12, '-deststoretype', 'PKCS12',
                            '-deststorepass', ks_pass, '-destkeypass', ks_pass], check=True, capture_output=True)
            key, cert, _ = pkcs12.load_key_and_certificates(open(p12, 'rb').read(), ks_pass.encode())
    if not isinstance(key, rsa.RSAPrivateKey):
        raise SystemExit('apksigner: only RSA keys are supported')
    return key, cert


def sign(apk: str, ks: str, ks_pass: str, alias: str, key_pass: str, out: str):
    data = open(apk, 'rb').read()
    entries, cd, eocd, cd_off, _old = split(data)  # an old signing block is dropped
    eocd = eocd_with_cd_offset(eocd, len(entries))
    digest = chunk_digest([entries, cd, eocd])
    key, cert = load_key(ks, ks_pass, alias, key_pass)
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

    digests = lp(struct.pack('<I', SIG_RSA_PKCS1_SHA256) + lp(digest))
    signed_data = lp(digests) + lp(lp(cert_der)) + lp(b'')
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signatures = lp(struct.pack('<I', SIG_RSA_PKCS1_SHA256) + lp(sig))
    signer = lp(signed_data) + lp(signatures) + lp(pub_der)
    value = lp(lp(signer))

    pair = struct.pack('<Q', 4 + len(value)) + struct.pack('<I', V2_ID) + value
    size = len(pair) + 8 + 16  # pairs + trailing size + magic
    block = struct.pack('<Q', size) + pair + struct.pack('<Q', size) + MAGIC

    new_eocd = eocd_with_cd_offset(eocd, len(entries) + len(block))
    tmp = out + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(entries + block + cd + new_eocd)
    os.replace(tmp, out)


def read_lp(b: bytes, o: int):
    n = struct.unpack_from('<I', b, o)[0]
    return b[o + 4:o + 4 + n], o + 4 + n


def seq(b: bytes):
    o, items = 0, []
    while o < len(b):
        item, o = read_lp(b, o)
        items.append(item)
    return items


def verify(apk: str, verbose: bool) -> int:
    data = open(apk, 'rb').read()
    entries, cd, eocd, cd_off, block = split(data)
    if block is None:
        print('DOES NOT VERIFY: no APK Signing Block')
        return 1
    o = 8
    v2 = None
    while o < len(block) - 24:
        n = struct.unpack_from('<Q', block, o)[0]
        pid = struct.unpack_from('<I', block, o + 8)[0]
        if pid == V2_ID:
            v2 = block[o + 12:o + 8 + n]
        o += 8 + n
    if v2 is None:
        print('DOES NOT VERIFY: no v2 signature')
        return 1
    digest = chunk_digest([entries, cd, eocd_with_cd_offset(eocd, len(entries))])
    signers_seq, _ = read_lp(v2, 0)
    for signer in seq(signers_seq):
        signed_data, o2 = read_lp(signer, 0)
        sigs, o2 = read_lp(signer, o2)
        pub, _ = read_lp(signer, o2)
        pubkey = serialization.load_der_public_key(pub)
        for s in seq(sigs):
            algo = struct.unpack_from('<I', s, 0)[0]
            sig, _ = read_lp(s, 4)
            if algo != SIG_RSA_PKCS1_SHA256:
                continue
            pubkey.verify(sig, signed_data, padding.PKCS1v15(), hashes.SHA256())
        dig_seq, o3 = read_lp(signed_data, 0)
        certs, _ = read_lp(signed_data, o3)
        for d in seq(dig_seq):
            algo = struct.unpack_from('<I', d, 0)[0]
            dv, _ = read_lp(d, 4)
            if algo == SIG_RSA_PKCS1_SHA256 and dv != digest:
                print('DOES NOT VERIFY: v2 content digest mismatch')
                return 1
        cert = x509.load_der_x509_certificate(seq(certs)[0])
        if cert.public_key().public_bytes(serialization.Encoding.DER,
                                          serialization.PublicFormat.SubjectPublicKeyInfo) != pub:
            print('DOES NOT VERIFY: certificate does not match public key')
            return 1
    print('Verifies')
    if verbose:
        print('Verified using v1 scheme (JAR signing): false')
        print('Verified using v2 scheme (APK Signature Scheme v2): true')
        print('Number of signers: 1')
    return 0


def main(argv):
    if not argv or argv[0] in ('--version', 'version'):
        print('0.9 (python stand-in, v2 only)')
        return 0
    cmd, args = argv[0], argv[1:]
    opts, files, verbose = {}, [], False
    i = 0
    while i < len(args):
        a = args[i]
        if a in ('-v', '--verbose'):
            verbose = True
        elif a.startswith('--') and i + 1 < len(args):
            opts[a] = args[i + 1]
            i += 1
        else:
            files.append(a)
        i += 1
    pw = lambda s: s[5:] if s and s.startswith('pass:') else (s or '')
    if cmd == 'sign':
        ks_pass = pw(opts.get('--ks-pass', 'pass:android'))
        sign(files[-1], opts['--ks'], ks_pass, opts.get('--ks-key-alias', ''), pw(opts.get('--key-pass')) or ks_pass,
             opts.get('--out', files[-1]))
        if verbose:
            print('Signed')
        return 0
    if cmd == 'verify':
        return verify(files[-1], verbose)
    print(f'apksigner: unsupported command {cmd}')
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
