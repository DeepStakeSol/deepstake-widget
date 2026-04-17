import Fastify from "fastify";


const fastify = Fastify({ logger: true });

fastify.get("/dstInfo", async (request, reply) => {
  

  return reply.send("OKK");
});