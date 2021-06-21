const { compareDataWithMap, updateDocument } = require('../helper');

const migrateModel = async (model, params = {}) => {
  // specific condition
  params.conditions = params.conditions || {};

  const { models, setting } = strapi.config.elasticsearch;

  // set default value
  setting.importLimit = setting.importLimit || 3000;

  const targetModel = models.find((item) => item.model === model);

  let indexConfig = strapi.elastic.indicesMapping[targetModel.model];

  const { body: indexExist } = await strapi.elastic.indices.exists({
    index: targetModel.index,
  });

  
  indexConfig = indexExist ? indexConfig : null;

  if (
    !targetModel ||
    targetModel.enabled === false ||
    targetModel.migration === false
  )
    return;

  let start = 0;
  strapi.elastic.log.debug(`Importing ${targetModel.model} to elasticsearch`);

  let index_length = await strapi.query(targetModel.model).count();
  index_length = parseInt(index_length / setting.importLimit);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const start_sql = Date.now();

    strapi.log.debug(`Getting ${targetModel.model} model data from database`);
    let result = await strapi.query(targetModel.model, targetModel.plugin).find(
      {
        _limit: setting.importLimit,
        _start: setting.importLimit * start,
        ...targetModel.conditions,
        ...params.conditions,
      },
      [...targetModel.relations]
    );
    if (result.length === 0) break;

    if (
      indexConfig &&
      indexConfig.mappings &&
      indexConfig.mappings.properties
    ) {
      const res = compareDataWithMap({
        docs: result,
        properties: indexConfig.mappings.properties,
      });

      result = res.result || result;
      //
    }

    //
    const end_sql = Date.now();
    //
    const body = await result.flatMap((doc) => {
      if (targetModel.fieldsToTransfrom) updateDocument(doc, targetModel.fieldsToTransfrom)

      return [
        {
          index: {
            _index: targetModel.index,
            _id: doc[targetModel.pk || 'id'],
            _type: '_doc',
          },
        },
        doc,
      ]
    });

    //
    const start_elastic = Date.now();

    strapi.log.debug(`Sending ${targetModel.model} model to elasticsearch...`);
    try {
      await strapi.elastic.bulk({ refresh: true, body });
    } catch (e) {
      strapi.log.error(e);
      return;
    }

    const end_elastic = Date.now();

    start++;

    // progress bar
    strapi.log.info(
      `(${start}/${index_length + 1}) Imported to ${
        targetModel.index
      } index | sql query took ${parseInt(
        (end_sql - start_sql) / 1000
      )}s and insert to elasticsearch took ${parseInt(
        (end_elastic - start_elastic) / 1000
      )}s`
    );

    //
  }
};
const migrateModels = async (params = {}) => {
  const { setting, models } = strapi.config.elasticsearch;

  params.models = params.models || [];
  params.conditions = params.conditions || {};

  // remove elasticsearch index before migration
  if (setting.removeExistIndexForMigration) {
    await models.forEach(async (model) => {
      if (model.enabled && model.migration) {
        await strapi.elastic.indices.delete({ index: model.index });
      }
    });
  }

  if (params.models.length !== 0) {
    const targetModels = models.filter((item) =>
      params.models.includes(item.model)
    );

    // call migrateModel function for each model
    for (const item of targetModels) {
      await migrateModel(item.model, params);
    }
  } else {
    // call migrateModel function for each model
    for (const item of models) {
      await migrateModel(item.model, params);
    }
  }

  strapi.log.info('All models imported...');
};

module.exports = { migrateModels, migrateModel };
