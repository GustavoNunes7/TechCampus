
#!/bin/bash

# TechCampus - Inicializador Linux Mint

cd "$(dirname "$0")"

echo "================================"
echo "       TECHCAMPUS"
echo "================================"

# Verificar Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "ERRO: Node.js não está instalado."
    read -p "Pressione ENTER para sair..."
    exit 1
fi

# Verificar npm
if ! command -v npm >/dev/null 2>&1; then
    echo "ERRO: npm não está instalado."
    read -p "Pressione ENTER para sair..."
    exit 1
fi

echo "Node.js: $(node -v)"
echo "NPM: $(npm -v)"

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências..."
    npm install

    if [ $? -ne 0 ]; then
        echo "ERRO ao instalar dependências."
        read -p "Pressione ENTER para sair..."
        exit 1
    fi
fi

echo ""
echo "Iniciando TechCampus..."
echo ""

npm start

echo ""
echo "Servidor encerrado."
read -p "Pressione ENTER para sair..."

