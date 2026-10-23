const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = '8837811664:AAFnHLltr2lJhPiupw9NiFwVLzBSn3d6Qjk';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const SUPABASE_URL = 'https://ksswuhtjrdytsrcvnwyt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JWeKrwjwRQ5ZfvHaAMJd8g_OX1S4JPA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function enviarMensaje(chatId, texto) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: 'Markdown'
    })
  });
}

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (!update.message || !update.message.text) return res.sendStatus(200);

    const chatId = update.message.chat.id;
    const textoOriginal = update.message.text.trim();
    const textoLower = textoOriginal.toLowerCase();
    const nombreUsuario = update.message.from.first_name || 'Usuario';

    // 1. Identificar o crear usuario en Supabase
    let { data: usuario } = await supabase
      .from('usuarios')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .single();

    if (!usuario) {
      await supabase.from('usuarios').insert([
        { telegram_chat_id: chatId, nombre: nombreUsuario }
      ]);
    }

    // 2. Comandos
    if (textoLower === '/start' || textoLower === 'menu') {
      await enviarMensaje(chatId, `🤖 *¡Hola ${nombreUsuario}! Bienvenid@ a tu gestor financiero multi-usuario.*\n\nEscribí tu gasto directamente para guardarlo, por ejemplo:\n\`15000 mac comida mp\``);
      return res.sendStatus(200);
    }

    if (textoLower === '/resumen' || textoLower === 'resumen') {
      const { data: movimientos } = await supabase
        .from('movimientos')
        .select('*')
        .eq('telegram_chat_id', chatId);

      let totalGastos = 0;
      if (movimientos) {
        movimientos.forEach(m => {
          if (m.monto < 0) totalGastos += Math.abs(m.monto);
        });
      }

      await enviarMensaje(chatId, `📊 *Tus Finanzas*\n\n💸 Total gastado registrado: $${totalGastos.toLocaleString('es-AR')}`);
      return res.sendStatus(200);
    }

    // 3. Registrar gasto
    const partes = textoOriginal.split(' ');
    const monto = parseFloat(partes[0].replace(',', '.'));

    if (!isNaN(monto) && monto > 0) {
      const categoria = partes[1] ? partes[1].toLowerCase() : 'varios';
      const detalle = partes.slice(2).join(' ') || '-';

      const { error } = await supabase.from('movimientos').insert([
        {
          telegram_chat_id: chatId,
          monto: -Math.abs(monto),
          tipo: 'Gasto',
          categoria: categoria,
          detalle: detalle,
          medio: 'Efectivo'
        }
      ]);

      if (error) {
        await enviarMensaje(chatId, "⚠️ Error al guardar en la base de datos.");
      } else {
        await enviarMensaje(chatId, `✅ *Gasto registrado*\n\n💰 Monto: $${monto.toLocaleString('es-AR')}\n📂 Categoría: ${categoria}\n📝 Detalle: ${detalle}`);
      }
    } else {
      await enviarMensaje(chatId, "⚠️ Comando no reconocido. Escribí /start para ver las opciones.");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error:", error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
