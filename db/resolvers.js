const Usuario = require("../models/Usuario");
const Producto = require("../models/Producto");
const Cliente = require("../models/Cliente");
const Pedido = require("../models/Pedido");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "variables.env" });

const createToken = (usuario, secreta, expiresIn) => {
  console.log(usuario);
  const { id, email, nombre, apellido } = usuario;

  return jwt.sign({ id, email, nombre, apellido }, secreta, { expiresIn });
};

// Resolvers

const resolvers = {
  // Query
  Query: {
    obtenerUsuario: async (_, {}, ctx) => {
      return ctx.usuario;
    },
    obtenerProductos: async () => {
      try {
        const productos = await Producto.find({});
        productos.sort((a, b) => (a.nombre > b.nombre ? 1 : -1));
        return productos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerProducto: async (_, { id }) => {
      // revisar si el producto existe
      const producto = await Producto.findById(id);

      if (!producto) {
        throw new Error("Producto no encontrado");
      }
      return producto;
    },
    obtenerClientes: async () => {
      try {
        const clientes = await Cliente.find({});
        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerClientesVendedor: async (_, {}, ctx) => {
      try {
        const clientes = await Cliente.find({
          vendedor: ctx.usuario.id.toString(),
        });
        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerCliente: async (_, { id }, ctx) => {
      // Revisar si el cliente existe
      const cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("Cliente no encontrado");
      }
      // Quien lo creó puede verlo
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }
      return cliente;
    },
    obtenerPedidos: async () => {
      try {
        const pedidos = await Pedido.find({});
        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedidosVendedor: async (_, {}, ctx) => {
      try {
        const pedidos = await Pedido.find({
          vendedor: ctx.usuario.id,
        }).populate("cliente");
        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedido: async (_, { id }, ctx) => {
      // si el pedido existe o no
      const pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Error("Pedido no encontrado");
      }
      // solo quien lo creó puede verlo
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }
      // retornar el resultado
      return pedido;
    },
    obtenerPedidosEstado: async (_, { estado }, ctx) => {
      const pedidos = await Pedido.find({ vendedor: ctx.usuario.id, estado });
      return pedidos;
    },
    mejoresClientes: async () => {
      const clientes = await Pedido.aggregate([
        //$match -> mongo = Where -> sql
        { $match: { estado: "COMPLETADO" } },
        {
          $group: {
            _id: "$cliente",
            total: { $sum: "$total" },
          },
        },
        {
          // mongo= lookup - sql=join - mongoose=populate
          $lookup: {
            from: "clientes",
            localField: "_id",
            foreignField: "_id",
            as: "cliente",
          },
        },
        {
          $limit: 10,
        },
        {
          $sort: { total: -1 },
        },
      ]);
      return clientes;
    },
    mejoresVendedores: async () => {
      const vendedores = await Pedido.aggregate([
        { $match: { estado: "COMPLETADO" } },
        {
          $group: {
            _id: "$vendedor",
            total: { $sum: "$total" },
          },
        },
        {
          $lookup: {
            from: "usuarios",
            localField: "_id",
            foreignField: "_id",
            as: "vendedor",
          },
        },
        {
          $limit: 3,
        },
        {
          $sort: { total: -1 },
        },
      ]);
      return vendedores;
    },
    buscarProducto: async (_, { texto }) => {
      const productos = await Producto.find({
        $text: { $search: texto },
      }).limit(5);
      return productos;
    },
  },

  // ***********Mutation ***************
  Mutation: {
    nuevoUsuario: async (_, { input }) => {
      const { email, password } = input;

      //Revisar si el usuario ya esta registrado
      const existeUsuario = await Usuario.findOne({ email });
      if (existeUsuario) {
        throw new Error("El usuario ya esta registrado");
      }

      // Hashear su password
      const salt = await bcryptjs.genSaltSync(10);
      input.password = await bcryptjs.hashSync(password, salt);

      try {
        //Guardarlo en la base de datos
        const usuario = new Usuario(input);
        usuario.save(); // guardarlo en la base
        return usuario;
      } catch (error) {
        console.log(error);
      }
    },
    autenticarUsuario: async (_, { input }) => {
      const { email, password } = input;

      //si el usuario existe
      const existeUsuario = await Usuario.findOne({ email });
      if (!existeUsuario) {
        throw new Error("El usuario no existe");
      }

      //revisar si el password es correcto
      const passwordCorrecto = await bcryptjs.compare(
        password,
        existeUsuario.password
      );
      if (!passwordCorrecto) {
        throw new Error("El password es incorrecto");
      }

      //crear el token
      return {
        token: createToken(existeUsuario, process.env.SECRETA, "24h"),
      };
    },
    nuevoProducto: async (_, { input }) => {
      try {
        const producto = new Producto(input);

        // almacenar en db
        const resultado = await producto.save();
        return resultado;
      } catch (error) {
        console.log(error);
      }
    },
    actualizarProducto: async (_, { id, input }) => {
      // revisar si el producto existe
      let producto = await Producto.findById(id);

      if (!producto) {
        throw new Error("Producto no encontrado");
      }

      // guardarlo en la base de datos
      producto = await Producto.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });
      return producto;
    },
    eliminarProducto: async (_, { id }) => {
      // revisar si el producto existe
      let producto = await Producto.findById(id);

      if (!producto) {
        throw new Error("Producto no encontrado");
      }
      // Eliminar producto
      await Producto.findOneAndDelete({ _id: id });
      return "Producto Eliminado";
    },
    nuevoCliente: async (_, { input }, ctx) => {
      console.log(ctx);
      const { email } = input;
      // Verificar si el cliente ya esta registrado
      // console.log(input);
      const cliente = await Cliente.findOne({ email });
      if (cliente) {
        throw new Error("Cliente ya registrado");
      }

      const nuevoCliente = new Cliente(input);

      // asignar el vendedor
      nuevoCliente.vendedor = ctx.usuario.id;

      // guardarlo en la base
      try {
        const resultado = await nuevoCliente.save();
        return resultado;
      } catch (error) {
        console.log(error);
      }
    },
    actualizarCliente: async (_, { id, input }, ctx) => {
      // Verificar si existe
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("El cliente no existe");
      }
      // Verificar si es su vendedor quien edita
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }
      // guardarlo en la base
      cliente = await Cliente.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });
      return cliente;
    },
    eliminarCliente: async (_, { id }, ctx) => {
      // Verificar si existe
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("El cliente no existe");
      }
      // Verificar si es su vendedor quien edita
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }
      // Eliminar cliente
      await Cliente.findOneAndDelete({ _id: id });
      return "Cliente eliminado";
    },
    nuevoPedido: async (_, { input }, ctx) => {
      const { cliente } = input;

      // Verificar si el cliente existe
      let clienteExiste = await Cliente.findById(cliente);

      if (!clienteExiste) {
        throw new Error("El cliente no existe");
      }

      // Verificar si el cliente es del vendedor
      if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }

      // Revisar que el stock este disponible
      for await (const articulo of input.pedido) {
        const { id } = articulo;

        const producto = await Producto.findById(id);

        if (articulo.cantidad > producto.existencia) {
          throw new Error(
            `El artículo: ${producto.nombre} excede la cantidad disponible`
          );
        } else {
          // restar la cantidad del stock
          producto.existencia = producto.existencia - articulo.cantidad;
          await producto.save();
        }
      }

      // Crear un nuevo pedido
      const nuevoPedido = new Pedido(input);

      //asignarle un vendedor
      nuevoPedido.vendedor = ctx.usuario.id;

      // Guardarlo en la base
      const resultado = await nuevoPedido.save();
      return resultado;
    },
    actualizarPedido: async (_, { id, input }, ctx) => {
      const { cliente } = input;

      // si el pedido existe
      const existePedido = await Pedido.findById(id);
      if (!existePedido) {
        throw new Error("El pedido no existe");
      }
      // si el cliente existe
      const existeCliente = await Cliente.findById(cliente);
      if (!existeCliente) {
        throw new Error("El cliente no existe");
      }

      //si el cliente y pedido pertenece al vendedor
      if (existeCliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }

      // revisar el stock
      if (input.pedido) {
        for await (const articulo of input.pedido) {
          const { id } = articulo;

          const producto = await Producto.findById(id);

          if (articulo.cantidad > producto.existencia) {
            throw new Error(
              `El artículo: ${producto.nombre} excede la cantidad disponible`
            );
          } else {
            // restar la cantidad del stock
            producto.existencia = producto.existencia - articulo.cantidad;
            await producto.save();
          }
        }
      }

      // guardarlo el pedido
      const resultado = await Pedido.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });
      return resultado;
    },
    eliminarPedido: async (_, { id }, ctx) => {
      // verificr si el pedido existe
      const pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Error("El pedido no existe");
      }
      //  verificr el vendedor que lo borra
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Credenciales inválidas");
      }

      // eliminar el pedido
      await Pedido.findOneAndDelete({ _id: id });
      return "Pedido eliminado";
    },
  },
};

module.exports = resolvers;
