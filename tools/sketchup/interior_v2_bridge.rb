# frozen_string_literal: true

# Interior Quote Manager v2 SketchUp bridge.
# Load this file inside SketchUp Ruby Console:
#   load "C:/workspace/인테리어-v2/tools/sketchup/interior_v2_bridge.rb"
#
# It opens a local-only HTTP bridge on 127.0.0.1:43434.
# Supported command:
#   POST /command
#   { "command": "generate_model", "payload": { "project": ..., "rooms": [...] } }
#
# Security note:
# - This bridge does not eval arbitrary Ruby.
# - It binds only to localhost.
# - It only accepts allowlisted commands.

require "json"
require "socket"
require "thread"

module InteriorV2Bridge
  HOST = "127.0.0.1"
  PORT = 43_434
  WALL_THICKNESS_M = 0.12
  DEFAULT_HEIGHT_M = 2.4

  class << self
    def start
      return if @server_thread&.alive?

      @server = TCPServer.new(HOST, PORT)
      @server_thread = Thread.new { accept_loop }
      puts "InteriorV2Bridge listening on http://#{HOST}:#{PORT}"
      true
    rescue Errno::EADDRINUSE
      puts "InteriorV2Bridge is already running on #{HOST}:#{PORT}"
      false
    end

    def stop
      @server&.close
      @server_thread&.kill
      @server = nil
      @server_thread = nil
      puts "InteriorV2Bridge stopped"
      true
    end

    private

    def accept_loop
      loop do
        socket = @server.accept
        Thread.new(socket) { |client| handle_client(client) }
      end
    rescue IOError
      nil
    end

    def handle_client(client)
      request_line = client.gets
      return client.close unless request_line

      method, path = request_line.split(" ")
      headers = read_headers(client)
      body = read_body(client, headers)

      if method == "OPTIONS"
        return write_response(client, 204, "")
      end
      unless method == "POST" && path == "/command"
        return write_json(client, 404, ok: false, error: "Not Found")
      end

      command = JSON.parse(body)
      result = handle_command(command)
      write_json(client, 200, result)
    rescue JSON::ParserError
      write_json(client, 400, ok: false, error: "Invalid JSON")
    rescue StandardError => e
      write_json(client, 500, ok: false, error: e.message)
    ensure
      client.close unless client.closed?
    end

    def read_headers(client)
      headers = {}
      while (line = client.gets)
        line = line.strip
        break if line.empty?

        key, value = line.split(":", 2)
        headers[key.downcase] = value&.strip if key
      end
      headers
    end

    def read_body(client, headers)
      length = headers["content-length"].to_i
      length.positive? ? client.read(length) : ""
    end

    def handle_command(command)
      case command["command"]
      when "ping"
        { ok: true, data: { status: "ready" } }
      when "generate_model"
        payload = command.fetch("payload")
        generate_model(payload)
        { ok: true, data: { generatedRooms: Array(payload["rooms"]).length } }
      else
        { ok: false, error: "Unsupported command" }
      end
    end

    def write_json(client, status, payload)
      write_response(client, status, JSON.generate(payload), "application/json; charset=utf-8")
    end

    def write_response(client, status, body, content_type = "text/plain; charset=utf-8")
      reason = {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
      }[status] || "OK"
      client.write "HTTP/1.1 #{status} #{reason}\r\n"
      client.write "Access-Control-Allow-Origin: http://127.0.0.1:3001\r\n"
      client.write "Access-Control-Allow-Methods: POST, OPTIONS\r\n"
      client.write "Access-Control-Allow-Headers: Content-Type\r\n"
      client.write "Content-Type: #{content_type}\r\n"
      client.write "Content-Length: #{body.bytesize}\r\n"
      client.write "Connection: close\r\n\r\n"
      client.write body
    end

    def generate_model(payload)
      model = Sketchup.active_model
      project = payload["project"] || {}
      rooms = Array(payload["rooms"])

      model.start_operation("Generate #{project["name"] || "Interior"} model", true)
      materials = model.materials
      floor_mat = material(materials, "InteriorV2 floor", 220, 234, 254)
      wall_mat = material(materials, "InteriorV2 wall", 148, 163, 184)

      root = model.active_entities.add_group
      root.name = project["name"] || "InteriorV2 generated model"

      rooms.each do |room|
        add_room(root.entities, room, floor_mat, wall_mat)
      end

      model.commit_operation
      model.active_view.zoom_extents
    rescue StandardError
      model.abort_operation if model
      raise
    end

    def material(materials, name, r, g, b)
      existing = materials[name]
      return existing if existing

      mat = materials.add(name)
      mat.color = Sketchup::Color.new(r, g, b)
      mat
    end

    def add_room(entities, room, floor_mat, wall_mat)
      geometry = room["geometry"] || {}
      x_m = number(geometry["xM"])
      y_m = number(geometry["yM"])
      width_m = number(geometry["widthM"], 2.4)
      depth_m = number(geometry["depthM"], 2.4)
      height_m = DEFAULT_HEIGHT_M

      group = entities.add_group
      group.name = room["name"] || "Room"
      room_entities = group.entities

      add_box(room_entities, x_m, y_m, width_m, depth_m, 0.04, floor_mat)
      add_box(room_entities, x_m, y_m, width_m, WALL_THICKNESS_M, height_m, wall_mat)
      add_box(room_entities, x_m, y_m + depth_m - WALL_THICKNESS_M, width_m, WALL_THICKNESS_M, height_m, wall_mat)
      add_box(room_entities, x_m, y_m, WALL_THICKNESS_M, depth_m, height_m, wall_mat)
      add_box(room_entities, x_m + width_m - WALL_THICKNESS_M, y_m, WALL_THICKNESS_M, depth_m, height_m, wall_mat)
      add_room_label(room_entities, room, x_m, y_m)
    end

    def add_box(entities, x_m, y_m, width_m, depth_m, height_m, material)
      points = [
        [x_m.m, y_m.m, 0],
        [(x_m + width_m).m, y_m.m, 0],
        [(x_m + width_m).m, (y_m + depth_m).m, 0],
        [x_m.m, (y_m + depth_m).m, 0],
      ]
      face = entities.add_face(points)
      face.material = material
      face.pushpull(height_m.m)
      face
    end

    def add_room_label(entities, room, x_m, y_m)
      point = Geom::Point3d.new((x_m + 0.2).m, (y_m + 0.2).m, 2.55.m)
      entities.add_text(room["name"] || "Room", point)
    end

    def number(value, fallback = 0)
      numeric = Float(value)
      numeric.finite? ? numeric : fallback
    rescue ArgumentError, TypeError
      fallback
    end
  end
end

InteriorV2Bridge.start
