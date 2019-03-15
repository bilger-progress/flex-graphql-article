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
    return (...arguments) => {
        return new Promise((resolve, reject) => {
            return func(...arguments, (error, data) => {
                if (error) {
                    return reject(error);
                }
                return resolve(data);
            });
        });
    };
}

/**
 * Fetch our Friend's data from the Kinvey Collection.
 * 
 * @param { String } name 
 * @param { Object } context
 * 
 * @returns { Promise } 
 */
function fetchFriendData(name, context) {
    return new Promise((resolve, reject) => {
        const findPromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).find);
        return findPromisified(new context.modules.Query().equalTo("name", name))
            .then((data) => {
                if (!data[0]) {
                    return resolve(null);
                }
                return resolve(data[0]);
            })
            .catch((error) => {
                return reject(error);
            });
    });
}

/**
 * Reveals to us what the age of a friend of ours is.
 * 
 * @param { String } name 
 * @param { Object } context
 */
function getAge(name, context) {
    return fetchFriendData(name, context)
        .then((data) => {
            if (data === null || !data.age) {
                return `Sorry. You still have not set age for ${name}.`;
            }
            return `Your friend - ${name}'s age is ${data.age}.`;
        })
        .catch(function (error) {
            // Flex Logger is a custom module for logging.
            // Please check the link given below.
            // https://devcenter.kinvey.com/nodejs/guides/flex-services#LoggingMessages
            context.flex.logger.error(error);
        });
};

/**
 * Sets the age of a friend of ours.
 * 
 * @param { String } name 
 * @param { Number } age 
 * @param { Object } context 
 */
function setAge(name, age, context) {
    return fetchFriendData(name, context)
        .then((data) => {
            let savePromisified = promisify(context.modules.dataStore().collection(COLLECTION_NAME).save);
            if (data === null) {
                return savePromisified({ name: name, age: age });
            }
            data.age = age;
            return savePromisified(data);
        })
        .then((data) => {
            return data.age;
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
            setAge: {
                args: {
                    name: { name: "name", type: new GraphQLNonNull(GraphQLString) },
                    age: { name: "age", type: new GraphQLNonNull(GraphQLInt) }
                },
                type: GraphQLString,
                resolve(parent, args, context) {
                    return setAge(args.name, args.age, context);
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
    flex.functions.register("query", (context, complete, modules) => {
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
            .then((data) => {
                return complete().setBody(data).ok().next();
            }, (error) => {
                return complete().setBody(error).runtimeError().done();
            });
    });
});
