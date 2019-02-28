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

// The Kinvey Collection, that you will be dealing with.
const COLLECTION_NAME = "FriendsAges";

/**
 * Since the Kinvey Flex SDK uses a callback pattern, we'll need to
 * wrap those in promises.
 * 
 * @param { Function } func 
 */
function promisify(func) {
    return (arguments) => {
        return new Promise((resolve, reject) => {
            return func(arguments, (error, data) => {
                if (error) {
                    return reject(error);
                }
                return resolve(data);
            });
        });
    };
}

/**
 * Goes through a process of fetching the person's information from the
 * Kinvey Collection and makes sure to prepare the correct message based
 * on the information found.
 * 
 * @param { String } name
 * @param { Object } context
 */
const getAge = function (name, context) {
    let findPromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).find);
    return findPromisified(new context.modules.Query().equalTo("name", name))
        .then(function (result) {
            // Handle the case when we do not have information in our Kinvey Collection.
            if (!result[0] || !result[0].hasOwnProperty("age")) {
                return {
                    success: false,
                    age: null
                };
            }
            // We've found the friend. Their age is set.
            return {
                success: true,
                age: result[0].age
            };
        })
        .then(function (preparedResponse) {
            // We are sorry.
            if (!preparedResponse.success) {
                return `Sorry. You still have not set age for ${name}.`;
            }
            // We are happy.
            return `Your friend - ${name}'s age is ${preparedResponse.age}.`;
        })
        .catch(function (error) {
            // Flex Logger is a custom module for logging.
            // Please check the link given below.
            // https://devcenter.kinvey.com/nodejs/guides/flex-services#LoggingMessages
            context.flex.logger.error(error);
        });
};

/**
 * Goes through a process of fetching the person's information from the
 * Kinvey Collection and makes sure to update that information.
 * 
 * @param { String } name
 * @param { Number } age
 * @param { Object } context
 */
const changeAge = function (name, age, context) {
    let findPromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).find);
    return findPromisified(new context.modules.Query().equalTo("name", name))
        .then(function (result) {
            let savePromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).save);
            if (!result[0]) {
                // We cannot find this friend in our Kinvey Collection. Let's set them up.
                return savePromisified({ name: name, age: age });
            }
            // We've found this friend's record. Let's change their age.
            result[0].age = age;
            return savePromisified(result[0]);
        })
        .then(function (savedResult) {
            return savedResult.age;
        })
        .catch(function (error) {
            // Flex Logger is a custom module for logging.
            // Please check the link given below.
            // https://devcenter.kinvey.com/nodejs/guides/flex-services#LoggingMessages
            context.flex.logger.error(error);
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
                resolve(parent, args, context) {
                    return getAge(args.name, context);
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
                resolve(parent, args, context) {
                    return changeAge(args.name, args.age, context);
                }
            }
        }
    })
});

// Initialize the Kinvey Flex Service.
kinveyFlexSDK.service((err, flex) => {
    if (err) {
        console.error("Error while initializing Flex!");
        console.error(err);
        return;
    }
    // Register the Kinvey Flex Function.
    flex.functions.register("query", function (context, complete, modules) {
        /**
         * Since Flex functions get executed within different contexts (app environments),
         * the information carried within the "context" and "modules" might 
         * differ. So, for each GraphQL request the respective function call's context needs
         * to be prepared.
         */
        let executionContext = {
            flex: flex,
            context: context,
            modules: modules
        };
        let graphqlArguments = {
            schema: schema,
            source: context.query.query,
            contextValue: executionContext
        };
        // FIRE!
        return graphql(graphqlArguments)
            .then(function (result) {
                return complete().setBody(result).ok().next();
            }, function (error) {
                return complete().setBody(error).runtimeError().done();
            });
    });
});
