'use strict'

// Boatsim -> Signal K -> NMEA 2000 bus.
//
// Boatsim encodes each PGN itself and sends one Actisense text line per message
// ("timestamp,prio,pgn,src,dst,len,hh,hh,...\n") over TCP. This plugin emits each
// line on the server event bus; Signal K's Actisense (canboatjs) connection
// listens for 'nmea2000out' and writes string messages straight to the gateway.
// Because the bytes are already encoded, field naming differences between
// canboatjs versions do not matter here.

const net = require('net')

const MAX_LINE_LENGTH = 4096

function isActisenseLine (line) {
  const parts = line.split(',')
  if (parts.length < 7) return false
  for (let i = 1; i <= 5; i++) {
    if (!/^\d+$/.test(parts[i])) return false
  }
  const len = Number(parts[5])
  if (len < 1 || len > 223 || parts.length !== 6 + len) return false
  for (let i = 6; i < parts.length; i++) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(parts[i])) return false
  }
  return true
}

module.exports = function (app) {
  const plugin = {
    id: 'signalk-boatsim-injector',
    name: 'Boatsim N2K Injector',
    description: 'Transmits NMEA 2000 messages from the boatsim simulator through this server\'s N2K connection'
  }

  let server = null
  let statusTimer = null
  const clients = new Set()
  let sent = 0
  let rejected = 0

  plugin.schema = {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        title: 'TCP port boatsim connects to',
        default: 10112
      },
      host: {
        type: 'string',
        title: 'Listen address',
        default: '0.0.0.0'
      },
      outEvent: {
        type: 'string',
        title: 'Output event(s), comma separated (must match the N2K connection\'s output event)',
        default: 'nmea2000out'
      }
    }
  }

  plugin.start = function (options) {
    const port = Number(options.port) || 10112
    const host = options.host || '0.0.0.0'
    const events = String(options.outEvent || 'nmea2000out')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean)

    sent = 0
    rejected = 0

    server = net.createServer(socket => {
      clients.add(socket)
      socket.setNoDelay(true)
      socket.setEncoding('utf8')
      const peer = `${socket.remoteAddress}:${socket.remotePort}`
      app.debug(`boatsim connected from ${peer}`)

      let buffer = ''
      socket.on('data', chunk => {
        buffer += chunk
        if (buffer.length > MAX_LINE_LENGTH * 64) {
          app.error(`boatsim client ${peer} sent oversized data, dropping connection`)
          socket.destroy()
          return
        }
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          if (line.length > MAX_LINE_LENGTH || !isActisenseLine(line)) {
            rejected++
            continue
          }
          for (const ev of events) app.emit(ev, line)
          sent++
        }
      })
      socket.on('close', () => {
        clients.delete(socket)
        app.debug(`boatsim disconnected from ${peer}`)
      })
      socket.on('error', err => app.debug(`boatsim socket error ${peer}: ${err.message}`))
    })

    server.on('error', err => {
      app.setPluginError(`TCP server error: ${err.message}`)
    })

    server.listen(port, host, () => {
      app.setPluginStatus(`Listening on ${host}:${port}`)
    })

    statusTimer = setInterval(() => {
      app.setPluginStatus(
        `Listening on ${host}:${port} - ${clients.size} client(s), ${sent} sent, ${rejected} rejected`
      )
    }, 5000)
  }

  plugin.stop = function () {
    if (statusTimer) clearInterval(statusTimer)
    statusTimer = null
    for (const s of clients) s.destroy()
    clients.clear()
    if (server) server.close()
    server = null
  }

  return plugin
}

module.exports.isActisenseLine = isActisenseLine
