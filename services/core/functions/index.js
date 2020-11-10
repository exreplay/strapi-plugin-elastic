const _ = require('lodash');
/* eslint-disable no-empty */
module.exports = {
  // need refactor
  find: async (index, query) => {
    try {
      const res = await strapi.elastic.search({
        index,
        ...query,
      });
      return res;
    } catch (e) {
      return null;
    }
  },
  findOne: async (model, { id }) => {
    const { models } = strapi.config.elasticsearch;
    const targetModel = models.find((item) => item.model === model);

    if (!targetModel || !id) return null;

    return strapi.elastic.get({
      index: targetModel.index,
      id,
    });
  },
  destroy: async (model, { id, id_in }) => {
    id_in = id_in || [id];

    const { models } = strapi.config.elasticsearch;
    const targetModel = models.find((item) => item.model === model);

    if (!targetModel || !id_in) return null;

    const body = await id_in.map((id) => {
      return {
        delete: {
          _index: targetModel.index,
          _type: '_doc',
          _id: id,
        },
      };
    });

    try {
      return strapi.elastic.bulk({ body });
    } catch (e) {
      return null;
    }
  },
  createOrUpdate: async (model, { id, data }) => {
    const { models } = strapi.config.elasticsearch;
    const targetModel = await models.find((item) => item.model === model);

    if (!targetModel || !data) return null;

    if (!id) {
      return strapi.elastic.index({
        index: targetModel.index,
        type: '_doc',
        body: data,
      });
    } else if (id) {
      if (!_.isArray(data)) data = [data];
      // console.log('data', JSON.stringify(data));

      const body = await data.flatMap((doc) => [
        {
          index: {
            _index: targetModel.index,
            _id: doc[targetModel.pk || 'id'],
          },
        },
        doc,
      ]);
      const aaa = await strapi.elastic.bulk({ body });
      // console.log('aaa', JSON.stringify(aaa));
      return aaa;
    }
  },
  migrateById: async (model, { id, id_in, relations, conditions }) => {
    const { models } = strapi.config.elasticsearch;

    const targetModel = models.find((item) => item.model === model);

    if (!targetModel) return null;

    id_in = id_in || [id];

    relations = relations || targetModel.relations;
    conditions = conditions || targetModel.conditions;

    const data = await strapi
      .query(targetModel.model, targetModel.plugin)
      .find({ id_in: [...id_in], ...conditions }, [...relations]);

    if (!data) return null;

    const body = await data.flatMap((doc) => [
      {
        index: { _index: targetModel.index, _id: doc[targetModel.pk || 'id'] },
      },
      doc,
    ]);

    return strapi.elastic.bulk({ refresh: true, body });
  },
};
