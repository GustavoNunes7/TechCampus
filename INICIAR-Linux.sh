
#!/bin/bash

cd "$(dirname "$0")"

echo "=================================="
echo "       TECHCAMPUS - LINUX"
echo "=================================="

echo "Verificando dependencias..."

if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install || exit 1
fi

echo "Iniciando servidor TechCampus..."

npm start

