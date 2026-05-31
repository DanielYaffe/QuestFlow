using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using MapleLib.MapleCryptoLib;
using MapleLib.WzLib;
using MapleLib.WzLib.Serialization;
using MapleLib.WzLib.Util;
using MapleLib.WzLib.WzProperties;
using Newtonsoft.Json;

namespace MapleQuestExporter
{
    internal static class Program
    {
        private const short TargetWzVersion = 83;
        private const WzMapleVersion TargetMapleVersion = WzMapleVersion.GMS;

        private static int Main(string[] args)
        {
            try
            {
                var options = CliOptions.Parse(args);
                if (options.Mode == "export")
                {
                    Export(options);
                    return 0;
                }
                if (options.Mode == "inspect")
                {
                    Inspect(options);
                    return 0;
                }

                Usage();
                return 2;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.ToString());
                return 1;
            }
        }

        private static void Export(CliOptions options)
        {
            if (string.IsNullOrWhiteSpace(options.Input) || string.IsNullOrWhiteSpace(options.Output))
            {
                throw new ArgumentException("export requires --input and --output.");
            }

            var json = File.ReadAllText(options.Input);
            var payload = JsonConvert.DeserializeObject<CanonicalExport>(json)
                ?? throw new InvalidOperationException("Input JSON did not contain a quest export payload.");

            var image = MapleTreeBuilder.Build(payload);
            var wzFile = new WzFile(TargetWzVersion, TargetMapleVersion);
            wzFile.Header = WzHeader.GetDefault();
            wzFile.WzDirectory.AddImage(image);
            File.WriteAllBytes(options.Output, SerializeImage(image, wzFile));

            if (!string.IsNullOrWhiteSpace(options.XmlPreview))
            {
                var xmlSerializer = new WzClassicXmlSerializer(0, LineBreak.None, true);
                xmlSerializer.SerializeImage(image, options.XmlPreview);
            }
        }

        private static void Inspect(CliOptions options)
        {
            if (string.IsNullOrWhiteSpace(options.Input))
            {
                throw new ArgumentException("inspect requires --input.");
            }

            var bytes = File.ReadAllBytes(options.Input);
            var deserializer = new WzImgDeserializer(false);
            var image = deserializer.WzImageFromIMGBytes(bytes, TargetMapleVersion, Path.GetFileName(options.Input), true);

            if (string.IsNullOrWhiteSpace(options.XmlPreview))
            {
                Console.WriteLine($"name={image.Name}");
                Console.WriteLine($"properties={image.WzProperties.Count}");
                return;
            }

            var xmlSerializer = new WzClassicXmlSerializer(0, LineBreak.None, true);
            xmlSerializer.SerializeImage(image, options.XmlPreview);
        }

        private static byte[] SerializeImage(WzImage image, WzFile wzFile)
        {
            using (var stream = new MemoryStream())
            {
                using (var writer = new WzBinaryWriter(stream, MapleCryptoConstants.MAPLESTORY_USERKEY_DEFAULT, true))
                {
                    writer.Header = wzFile.Header;
                    writer.Hash = 0;
                    writer.StringCache = new Hashtable();
                    writer.WzKey = WzKeyGenerator.GenerateWzKey(WzTool.GetIvByMapleVersion(wzFile.MapleVersion));
                    image.SaveImage(writer, true, true);
                    writer.Flush();
                }
                return stream.ToArray();
            }
        }

        private static void Usage()
        {
            Console.Error.WriteLine("Usage:");
            Console.Error.WriteLine("  MapleQuestExporter export --input quest.json --output quest.img [--xml-preview quest.xml]");
            Console.Error.WriteLine("  MapleQuestExporter inspect --input quest.img [--xml-preview readback.xml]");
        }
    }

    internal sealed class CliOptions
    {
        public string Mode { get; private set; } = "";
        public string Input { get; private set; } = "";
        public string Output { get; private set; } = "";
        public string XmlPreview { get; private set; } = "";

        public static CliOptions Parse(string[] args)
        {
            var options = new CliOptions();
            if (args.Length > 0) options.Mode = args[0];

            for (var i = 1; i < args.Length; i++)
            {
                var value = i + 1 < args.Length ? args[i + 1] : "";
                switch (args[i])
                {
                    case "--input":
                        options.Input = value;
                        i++;
                        break;
                    case "--output":
                        options.Output = value;
                        i++;
                        break;
                    case "--xml-preview":
                        options.XmlPreview = value;
                        i++;
                        break;
                }
            }

            return options;
        }
    }

    internal static class MapleTreeBuilder
    {
        public static WzImage Build(CanonicalExport payload)
        {
            var image = new WzImage("Questline");
            image.AddProperty(Int("schemaVersion", 1));
            image.AddProperty(Object("meta",
                Str("id", payload.Meta.Id),
                Str("title", payload.Meta.Title),
                Str("genre", payload.Meta.Genre),
                Str("description", payload.Meta.Description)
            ));

            image.AddProperty(BuildNodes(payload));
            image.AddProperty(BuildEdges(payload.Edges));
            image.AddProperty(BuildCharacters(payload.Characters));
            image.AddProperty(BuildObjectives(payload.Objectives));
            image.AddProperty(BuildRewards(payload.Rewards));
            image.AddProperty(BuildChapters(payload.Chapters));
            image.MarkWzImageAsParsed();
            return image;
        }

        private static WzSubProperty BuildNodes(CanonicalExport payload)
        {
            var outgoing = new Dictionary<string, List<string>>();
            var incoming = new Dictionary<string, List<string>>();
            foreach (var edge in payload.Edges)
            {
                AddTo(outgoing, edge.Source, edge.Id);
                AddTo(incoming, edge.Target, edge.Id);
            }

            var root = new WzSubProperty("nodes");
            foreach (var node in payload.Nodes)
            {
                root.AddProperty(Object(node.Id,
                    Str("id", node.Id),
                    Str("title", node.Title),
                    Str("body", node.Body),
                    Str("variant", node.Variant),
                    List("npcIds", node.NpcIds),
                    List("monsterIds", node.MonsterIds),
                    List("rewardIds", node.RewardIds),
                    List("outgoingEdges", outgoing.ContainsKey(node.Id) ? outgoing[node.Id] : new List<string>()),
                    List("incomingEdges", incoming.ContainsKey(node.Id) ? incoming[node.Id] : new List<string>())
                ));
            }
            return root;
        }

        private static WzSubProperty BuildEdges(IReadOnlyList<CanonicalEdge> edges)
        {
            var root = new WzSubProperty("edges");
            foreach (var edge in edges)
            {
                root.AddProperty(Object(edge.Id,
                    Str("id", edge.Id),
                    Str("source", edge.Source),
                    Str("target", edge.Target)
                ));
            }
            return root;
        }

        private static WzSubProperty BuildCharacters(IReadOnlyList<CanonicalCharacter> characters)
        {
            var root = new WzSubProperty("characters");
            foreach (var character in characters)
            {
                root.AddProperty(Object(character.Id,
                    Str("id", character.Id),
                    Str("name", character.Name),
                    Str("appearance", character.Appearance),
                    Str("background", character.Background)
                ));
            }
            return root;
        }

        private static WzSubProperty BuildObjectives(IReadOnlyList<CanonicalObjective> objectives)
        {
            var root = new WzSubProperty("objectives");
            foreach (var objective in objectives)
            {
                root.AddProperty(Object(objective.Id,
                    Str("id", objective.Id),
                    Str("title", objective.Title),
                    Str("description", objective.Description)
                ));
            }
            return root;
        }

        private static WzSubProperty BuildRewards(IReadOnlyList<CanonicalReward> rewards)
        {
            var root = new WzSubProperty("rewards");
            foreach (var reward in rewards)
            {
                root.AddProperty(Object(reward.Id,
                    Str("id", reward.Id),
                    Str("title", reward.Title),
                    Str("description", reward.Description),
                    Str("rarity", reward.Rarity)
                ));
            }
            return root;
        }

        private static WzSubProperty BuildChapters(IReadOnlyList<CanonicalChapter> chapters)
        {
            var root = new WzSubProperty("chapters");
            foreach (var chapter in chapters)
            {
                var scenes = new WzSubProperty("scenes");
                for (var i = 0; i < chapter.Scenes.Count; i++)
                {
                    var scene = chapter.Scenes[i];
                    scenes.AddProperty(Object(i.ToString(),
                        Str("id", scene.Id),
                        Str("title", scene.Title)
                    ));
                }

                root.AddProperty(Object(chapter.Id,
                    Str("id", chapter.Id),
                    Str("title", chapter.Title),
                    scenes
                ));
            }
            return root;
        }

        private static void AddTo(Dictionary<string, List<string>> map, string key, string value)
        {
            if (!map.TryGetValue(key, out var list))
            {
                list = new List<string>();
                map[key] = list;
            }
            list.Add(value);
        }

        private static WzSubProperty Object(string name, params WzImageProperty[] children)
        {
            var property = new WzSubProperty(name);
            foreach (var child in children)
            {
                property.AddProperty(child);
            }
            return property;
        }

        private static WzSubProperty List(string name, IReadOnlyList<string> values)
        {
            var property = new WzSubProperty(name);
            for (var i = 0; i < values.Count; i++)
            {
                property.AddProperty(Str(i.ToString(), values[i]));
            }
            return property;
        }

        private static WzStringProperty Str(string name, string value)
        {
            return new WzStringProperty(name, value ?? "");
        }

        private static WzIntProperty Int(string name, int value)
        {
            return new WzIntProperty(name, value);
        }
    }

    internal sealed class CanonicalExport
    {
        [JsonProperty("meta")] public CanonicalMeta Meta { get; set; } = new CanonicalMeta();
        [JsonProperty("nodes")] public List<CanonicalNode> Nodes { get; set; } = new List<CanonicalNode>();
        [JsonProperty("edges")] public List<CanonicalEdge> Edges { get; set; } = new List<CanonicalEdge>();
        [JsonProperty("characters")] public List<CanonicalCharacter> Characters { get; set; } = new List<CanonicalCharacter>();
        [JsonProperty("rewards")] public List<CanonicalReward> Rewards { get; set; } = new List<CanonicalReward>();
        [JsonProperty("objectives")] public List<CanonicalObjective> Objectives { get; set; } = new List<CanonicalObjective>();
        [JsonProperty("chapters")] public List<CanonicalChapter> Chapters { get; set; } = new List<CanonicalChapter>();
    }

    internal sealed class CanonicalMeta
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("title")] public string Title { get; set; } = "";
        [JsonProperty("genre")] public string Genre { get; set; } = "";
        [JsonProperty("description")] public string Description { get; set; } = "";
    }

    internal sealed class CanonicalNode
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("variant")] public string Variant { get; set; } = "";
        [JsonProperty("title")] public string Title { get; set; } = "";
        [JsonProperty("body")] public string Body { get; set; } = "";
        [JsonProperty("npcIds")] public List<string> NpcIds { get; set; } = new List<string>();
        [JsonProperty("monsterIds")] public List<string> MonsterIds { get; set; } = new List<string>();
        [JsonProperty("rewardIds")] public List<string> RewardIds { get; set; } = new List<string>();
    }

    internal sealed class CanonicalEdge
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("source")] public string Source { get; set; } = "";
        [JsonProperty("target")] public string Target { get; set; } = "";
    }

    internal sealed class CanonicalCharacter
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("name")] public string Name { get; set; } = "";
        [JsonProperty("appearance")] public string Appearance { get; set; } = "";
        [JsonProperty("background")] public string Background { get; set; } = "";
    }

    internal sealed class CanonicalReward
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("title")] public string Title { get; set; } = "";
        [JsonProperty("description")] public string Description { get; set; } = "";
        [JsonProperty("rarity")] public string Rarity { get; set; } = "";
    }

    internal sealed class CanonicalObjective
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("title")] public string Title { get; set; } = "";
        [JsonProperty("description")] public string Description { get; set; } = "";
    }

    internal sealed class CanonicalChapter
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("title")] public string Title { get; set; } = "";
        [JsonProperty("scenes")] public List<CanonicalScene> Scenes { get; set; } = new List<CanonicalScene>();
    }

    internal sealed class CanonicalScene
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("title")] public string Title { get; set; } = "";
    }
}
