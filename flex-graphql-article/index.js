"use-strict"

// Get the Kinvey Flex SDK.
const kinveyFlexSDK = require("kinvey-flex-sdk");

// GraphQL related dependencies.
const {
    graphql,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLInt,
    GraphQLNonNull,
} = require("graphql");

// The Kinvey Collection that you will be dealing with.
const COLLECTION_NAME = "FriendsAges";

// Set those references, so we can access them everywhere in our code.
let references = {
    modules: null,
    flex: null
};

/**
 * Since the Kinvey Flex SDK uses a callback pattern, we'll need to
 * wrap those in promises.
 * 
 * @param {Function} foo 
 */
const promisify = function (foo) {
    return new Promise(function (resolve, reject) {
        foo(function (error, result) {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
};

/**
 * Goes through a process of fetching the person's information from the
 * Kinvey Collection and makes sure to prepare the correct message based
 * on the information found.
 * 
 * @param {String} name
 */
const getAge = function (name) {
    return promisify(function (callback) {
        return references.modules.dataStore().collection(COLLECTION_NAME)
            .find(new references.modules.Query().equalTo("name", name), callback);
    })
        .then(function (result) {
            // Handle the case when we do not have information in our Kinvey Collection.
            if (!result[0] || !result[0].hasOwnProperty("age")) {
                return {
                    success: false,
                    message: `You still have not set age for ${name}.`
                };
            }
            // We've found the friend. Their age is set.
            return {
                success: true,
                message: result[0].age
            };
        })
        .then(function (preparedResponse) {
            // We are sorry.
            if (!preparedResponse.success) {
                return `Sorry. ${preparedResponse.messаге}`;
            }
            // We are happy.
            return `Your friend - ${name}'s age is ${preparedResponse.message}.`;
        })
        .catch(function (error) {
            references.flex.logger.error(error);
        });
};

/**
 * Goes through a process of fetching the person's information from the
 * Kinvey Collection and makes sure to update that information.
 * 
 * @param {String} name 
 * @param {Number} age 
 */
const changeAge = function (name, age) {
    return promisify(function (callback) {
        return references.modules.dataStore().collection(COLLECTION_NAME)
            .find(new references.modules.Query().equalTo("name", name), callback);
    })
        .then(function (result) {
            // We cannot find this friend in our Kinvey Collection. Let's set them up.
            if (!result[0]) {
                return promisify(function (callback) {
                    return references.modules.dataStore().collection(COLLECTION_NAME)
                        .save({ name: name, age: age }, callback);
                });
            }
            // We've found this friend's record. Let's change their age.
            result[0].age = age;
            return promisify(function (callback) {
                return references.modules.dataStore().collection(COLLECTION_NAME)
                    .save(result[0], callback);
            });
        })
        .then(function (savedResult) {
            return savedResult.age;
        })
        .catch(function (error) {
            references.flex.logger.error(error);
        });
};

// The query & mutation declarations to the schema.
const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: "RootQueryType",
        fields: {
            getAge: {
                args: { name: { name: "name", type: new GraphQLNonNull(GraphQLString) } },
                type: GraphQLString,
                resolve (parent, args) {
                    return getAge(args.name);
                }
            }
        }
    }),
    mutation: new GraphQLObjectType({
        name: "RootMutationType",
        fields: {
            changeAge: {
                args: {
                    name: { name: "name", type: new GraphQLNonNull(GraphQLString) },
                    age: { name: "age", type: new GraphQLNonNull(GraphQLInt) }
                },
                type: GraphQLString,
                resolve (parent, args) {
                    return changeAge(args.name, args.age);
                }
            }
        }
    })
});

// Initialize the Kinvey Flex Service.
kinveyFlexSDK.service((err, flex) => {
    if (err) {
        console.log("Error while initializing Flex!");
        return;
    }

    // Set the "flex" reference for future usage.
    if (!references.flex) {
        references.flex = flex;
    }

    // Register the Kinvey Flex Function.
    flex.functions.register("query", function (context, complete, modules) {
        // Set the "modules" reference for future usage.
        if (!references.modules) {
            references.modules = modules;
        }
        // FIRE!
        return graphql(schema, context.query.query)
            .then(function (result) {
                return complete().setBody(result).ok().next();
            }, function (error) {
                return complete().setBody(error).runtimeError().done();
            });
    });
});