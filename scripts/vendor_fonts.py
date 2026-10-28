"""Atualiza apenas as fontes locais, preservando TLS e a integridade dos pacotes."""
import base64
import hashlib
import io
from pathlib import Path
import tarfile
import urllib.request

DEST = Path(__file__).resolve().parents[1] / 'public' / 'fonts'
PACKAGES = {
    'bebas-neue': ('nCxMEb9Bg9sjNWm9TIOsvHKDMLRUfEZPWpLgYu6m9KavZZVSA/WoHzI5wROwqA+eNwEi/PNBAcB5Co7HA3S0Cw==', [(400, 'normal')]),
    'poppins': ('cms1nM7U6SN8epIV1WMVOV8VsA645aSm3wHfzIQnkk188U341ThbJGSl2Sv54V29gnDbT2arMPfLzvVIIVCceQ==', [(400, 'normal'), (400, 'italic'), (500, 'normal'), (600, 'normal'), (700, 'normal'), (800, 'normal')]),
}

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for name, (checksum, faces) in PACKAGES.items():
        url = f'https://registry.npmjs.org/@fontsource/{name}/-/{name}-5.3.0.tgz'
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read()
        if base64.b64encode(hashlib.sha512(data).digest()).decode() != checksum:
            raise RuntimeError(f'Integridade inválida: {name}')
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            # Nomes explícitos: não extrai caminhos arbitrários do tarball.
            for weight, style in faces:
                filename = f'{name}-latin-{weight}-{style}.woff2'
                (DEST / filename).write_bytes(archive.extractfile('package/files/' + filename).read())
            (DEST / f'{name}-OFL.txt').write_bytes(archive.extractfile('package/LICENSE').read())
        print(f'{name} 5.3.0: fontes e licença salvas; SHA-512 verificado.')

if __name__ == '__main__':
    main()
