#!/bin/bash
# Скрипт для быстрой отправки проекта в репозиторий GitHub

if [ -z "$1" ]; then
  echo "Использование: ./push_to_github.sh <URL_вашего_репозитория>"
  echo "Пример: ./push_to_github.sh https://github.com/username/kototeka.git"
  exit 1
fi

REPO_URL="$1"

echo "🐾 Инициализация Git и подготовка файлов..."
git init
git branch -M main
git add .
git commit -m "Release Kototeka Android App with GitHub Actions"

echo "🔗 Подключение к $REPO_URL..."
git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL"

echo "🚀 Отправка файлов на GitHub..."
git push -u origin main --force

echo ""
echo "✅ Готово! Перейдите на страницу репозитория в раздел 'Actions' — там началась сборка вашего APK!"
