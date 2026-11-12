#!/bin/sh
# 每次部署前更新版本号，让手机一定拿到最新的网页代码
V=$(date +%m%d%H%M)
sed -i -E "s#/(app|rain)\.js(\?v=[0-9]+)?\"#/\1.js?v=$V\"#g; s#/style\.css(\?v=[0-9]+)?\"#/style.css?v=$V\"#" public/index.html
sed -i -E "s#^const VERSION = \"[0-9]+\";#const VERSION = \"$V\";#" public/app.js
echo "version $V"
